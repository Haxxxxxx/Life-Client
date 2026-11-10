/**
 * Push service worker.
 *
 * Two rules drive everything here. The subscription is `userVisibleOnly: true`,
 * so the browser REQUIRES a notification for every push it delivers — if this
 * handler throws, or returns without showing one, Chrome substitutes its own
 * "This site has been updated in the background" notice. And a `notificationclick`
 * is the user asking to go somewhere specific, so focusing an arbitrary tab and
 * stopping there loses the whole point of the notification.
 */

const FALLBACK_TITLE = "Life Client";
// The app ships no dedicated notification icon yet; the favicon is at least
// its own mark rather than the Next.js template logo that was here before.
// A 192x192 PNG would render better on Android.
const ICON = "/favicon.ico";

/** Never throws: a malformed payload must still produce a notification. */
function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() ?? {};
  } catch {
    // Not JSON — a plain-text test push from devtools, or a provider error
    // body. `event.data.json()` throws on those, and an uncaught throw in a
    // push handler is exactly what triggers the browser's generic notice.
    try {
      const text = event.data.text();
      return text ? { body: text } : {};
    } catch {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  // Unconditional: the previous `if (!event.data) return;` skipped the
  // notification entirely, which the browser then filled in for us.
  event.waitUntil(
    self.registration.showNotification(payload.title ?? FALLBACK_TITLE, {
      body: payload.body ?? "",
      icon: ICON,
      badge: ICON,
      tag: payload.tag,
      data: payload.data ?? {},
    }),
  );
});

/** Same-origin paths only — the payload is server-supplied, but this is cheap. */
function safeUrl(raw) {
  try {
    const url = new URL(raw ?? "/dashboard", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/dashboard", self.location.origin).href;
  } catch {
    return new URL("/dashboard", self.location.origin).href;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        // Focus AND navigate. The old handler returned on the first `focus()`,
        // so tapping a "task due" notification just surfaced whatever tab
        // happened to be open and never went to the task.
        if ("focus" in client) {
          const focused = client.focus();
          return "navigate" in client ? focused.then((c) => (c ?? client).navigate(target)) : focused;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
