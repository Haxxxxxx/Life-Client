import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Routes a notification tap to the screen it refers to.
 *
 * There was no response listener at all, so tapping a push simply opened the
 * app on whatever tab was last shown — the notification's whole purpose was
 * lost. The payload carries an optional `path` (sendPush forwards `data`
 * verbatim); anything else just opens the app.
 *
 * Two entry points are needed, because they are genuinely different cases:
 * `getLastNotificationResponseAsync` covers a tap that *launched* the app from
 * cold, which fires before any listener could be attached, while the listener
 * covers taps while the app is already running.
 */
const KNOWN_PATHS = new Set([
  '/',
  '/tasks',
  '/goals',
  '/agenda',
  '/money',
  '/music',
  '/sports',
  '/knowledge',
  '/profile',
  '/search',
  '/integrations',
]);

function routeTo(response: Notifications.NotificationResponse | null) {
  const path = response?.notification.request.content.data?.path;
  // Only navigate to a path we recognise: the payload is server-supplied, and
  // an unexpected value should open the app rather than throw in the router.
  if (typeof path === 'string' && KNOWN_PATHS.has(path)) {
    router.push(path as Parameters<typeof router.push>[0]);
  }
}

export function useNotificationRouting(isSignedIn: boolean) {
  useEffect(() => {
    // Nothing to route to until the signed-in tabs exist.
    if (!isSignedIn) return;
    let cancelled = false;

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!cancelled) routeTo(response);
      })
      .catch((err) => console.error('Could not read the launching notification', err));

    const subscription = Notifications.addNotificationResponseReceivedListener(routeTo);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isSignedIn]);
}
