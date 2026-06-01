// Background message handler for Firebase Cloud Messaging.
// This file ships as-is from /public — no Vite processing.
// It reads its Firebase config from the URL hash that the app sets when it
// registers the SW (avoids hardcoding the config or needing build-time injection).
//
// Frontend registration pattern:
//   navigator.serviceWorker.register(
//     `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig)}`
//   );
//
// FCM uses compat builds because the modular SDK doesn't run in classic
// service workers without a bundler step.

/* global importScripts, firebase, self, clients */

importScripts(
  "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js"
);

const url = new URL(self.location.href);
const config = {
  apiKey: url.searchParams.get("apiKey"),
  authDomain: url.searchParams.get("authDomain"),
  projectId: url.searchParams.get("projectId"),
  messagingSenderId: url.searchParams.get("messagingSenderId"),
  appId: url.searchParams.get("appId"),
};

if (config.apiKey && config.projectId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? "Collabry";
    const options = {
      body: payload.notification?.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      data: payload.data ?? {},
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith(link) && "focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
