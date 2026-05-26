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
  const notificationTitle = payload.notification?.title || "HPCL Interns Cult";
  const notificationOptions = {
    body: payload.notification?.body || "You have a new message.",
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
