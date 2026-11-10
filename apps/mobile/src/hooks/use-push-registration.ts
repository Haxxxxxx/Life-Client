import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { data, expoPushTokenDocId } from '@life-client/shared';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Foreground presentation. Without a handler, a notification arriving while
 * the app is open is swallowed silently on both platforms — the app simply
 * looked broken.
 *
 * `shouldShowAlert` is deprecated in SDK 57; `shouldShowBanner` and
 * `shouldShowList` are the required replacements (verified against the
 * installed expo-notifications 57.0.15 types).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
    (Constants.easConfig?.projectId as string | undefined)
  );
}

/**
 * Requests notification permission and registers this device's Expo push
 * token while a user is signed in. No-ops on simulators (no push capability).
 *
 * Note it no longer gates on `db`: the writes go through the `data.*` facade,
 * so a Firestore handle is not the right precondition and would have silently
 * disabled push if the backend ever moved to Supabase.
 */
export function usePushRegistration(uid: string | undefined) {
  useEffect(() => {
    if (!uid || !Device.isDevice) return;
    const currentUid = uid;

    let cancelled = false;

    async function register() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || cancelled) return;

      const id = projectId();
      if (!id) {
        // Previously a silent return — a missing projectId meant push just
        // never worked, with nothing to explain why.
        console.warn('Push disabled: no EAS projectId in app config');
        return;
      }

      const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId: id });
      if (!cancelled) await data.registerExpoPushToken(currentUid, expoPushToken);
    }

    register().catch((err) => console.error('Could not register push token', err));

    // Expo can rotate the token while the app is running. Without this the new
    // token was only picked up at the next cold start, so pushes silently
    // stopped reaching the device in between.
    const tokenListener = Notifications.addPushTokenListener((token) => {
      if (typeof token.data === 'string') {
        data.registerExpoPushToken(currentUid, token.data).catch((err) =>
          console.error('Could not persist refreshed push token', err),
        );
      }
    });

    return () => {
      cancelled = true;
      tokenListener.remove();
    };
  }, [uid]);
}

/**
 * Removes this device's token for the user who is signing out.
 *
 * Without it the token stayed registered against the previous account, so
 * after a sign-out — or after a different person signed in on the same
 * device — that account's notifications kept arriving here, and the token was
 * registered under both users at once.
 */
export async function unregisterThisDevice(uid: string): Promise<void> {
  if (!Device.isDevice) return;
  const id = projectId();
  if (!id) return;
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await data.unregisterPushToken(uid, expoPushTokenDocId(expoPushToken));
}
