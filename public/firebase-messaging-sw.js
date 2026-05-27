// =========================================================================
// HPCL INTERN CONNECT — UNIFIED SERVICE WORKER (PWA & FIREBASE MESSAGING)
// =========================================================================
// This single unified worker manages offline caching, desktop/mobile app 
// home screen install prompts, and background Firebase push notifications.
// Having a single worker prevents scope registration conflicts in browsers.
// =========================================================================

// -------------------------------------------------------------
// 1. PWA OFFLINE CACHING & INSTALLATION CAPABILITIES
// -------------------------------------------------------------
const CACHE_NAME = 'hpcl-connect-v3';
const ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Dynamic API, Supabase Realtime, and Google/Firebase push networks must bypass the cache
  if (
    e.request.url.includes('/api/') || 
    e.request.url.includes('supabase.co') || 
    e.request.url.includes('firebase') || 
    e.request.url.includes('googleapis')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Safe fail
      });
    })
  );
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
