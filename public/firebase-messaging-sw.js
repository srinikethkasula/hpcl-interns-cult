// Version: v3.1.2-recovery
// =========================================================================
// HPCL INTERN CONNECT — UNIFIED SERVICE WORKER (PWA & FIREBASE MESSAGING)
// =========================================================================
// This single unified worker manages offline caching, desktop/mobile app 
// home screen install prompts, and background Firebase push notifications.
// Having a single worker prevents scope registration conflicts in browsers.
// =========================================================================

// -------------------------------------------------------------
// 1. PWA INSTALLATION & AUTO-CLEANUP CACHE SYSTEM
// -------------------------------------------------------------
// Having an active service worker with a fetch listener makes the app fully
// installable on mobile/desktop home screens, but we do zero caching to prevent
// Next.js chunk-loading conflicts and cache-crash issues.

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Wipes out all legacy caches to immediately solve any stuck loading/crashed screens
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// A standard pass-through fetch listener (required by browsers for PWA installability)
self.addEventListener('fetch', (e) => {
  // Pass-through to network, ensuring the latest live code is always fetched immediately
  return;
});

// -------------------------------------------------------------
// 2. FIREBASE BACKGROUND PUSH NOTIFICATION LISTENERS
// -------------------------------------------------------------
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDez_MkW0-gJ_ZZokmELpFgpv3hG5S8ImM",
  authDomain: "hpcl-interns-cult.firebaseapp.com",
  projectId: "hpcl-interns-cult",
  storageBucket: "hpcl-interns-cult.firebasestorage.app",
  messagingSenderId: "237206802075",
  appId: "1:237206802075:web:51e43dcf0c85e493cd803e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || "HPCL Intern Connect";
  const notificationOptions = {
    body: payload.notification?.body || "You have a new message.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.data?.chat_id || 'general-notification',
    requireInteraction: false
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
