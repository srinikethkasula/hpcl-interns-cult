import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { supabase } from "@/lib/supabase/client";

const firebaseConfig = {
  apiKey: "AIzaSyDez_MkW0-gJ_ZZokmELpFgpv3hG5S8ImM",
  authDomain: "hpcl-interns-cult.firebaseapp.com",
  projectId: "hpcl-interns-cult",
  storageBucket: "hpcl-interns-cult.firebasestorage.app",
  messagingSenderId: "237206802075",
  appId: "1:237206802075:web:51e43dcf0c85e493cd803e"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const setupFCM = async () => {
  try {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const messaging = getMessaging(app);
      const permission = await Notification.requestPermission();
      
      if (permission === "granted") {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
        
        await navigator.serviceWorker.ready;
        
        // Fetch VAPID key securely and dynamically from Supabase
        const { data: config } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'fcm_vapid_key')
          .maybeSingle();

        const vapidKey = config?.value && !config.value.includes('PASTE_YOUR') ? config.value : undefined;

        if (!vapidKey) {
          console.warn("FCM VAPID key is missing or not configured in app_config table. Push token registration skipped.");
          return null;
        }
        
        const token = await getToken(messaging, {
          serviceWorkerRegistration: registration,
          vapidKey: vapidKey
        });
        console.log("FCM Token Generated:", token);
        
        onMessage(messaging, (payload) => {
          console.log("Message received in foreground: ", payload);
        });
        
        return token;
      }
    }
  } catch (error) {
    console.error("FCM Setup failed:", error);
  }
  return null;
};
