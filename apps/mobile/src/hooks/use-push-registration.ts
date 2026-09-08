import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { data } from '@life-client/shared';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { db } from '@/lib/firebase';

/** Requests notification permission and registers the device's Expo push token once a user is signed in. No-ops on simulators/emulators (no push capability) and when Firebase isn't configured. */
export function usePushRegistration(uid: string | undefined) {
  useEffect(() => {
    if (!uid || !db || !Device.isDevice) return;
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

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!cancelled && db) {
        await data.registerExpoPushToken(currentUid, expoPushToken);
      }
    }

    register().catch((err) => console.error('Could not register push token', err));

    return () => {
      cancelled = true;
    };
  }, [uid]);
}
