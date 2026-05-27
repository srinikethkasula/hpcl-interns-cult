"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AuthForm from "@/components/auth/AuthForm";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
      } else if (session) {
        setSession(session);
      }
    });

    // Register PWA Service Worker with Auto-Update & Reload capabilities
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js').then((reg) => {
        console.log('ServiceWorker registration successful: ', reg.scope);
        
        // Listen for new updates
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New update installed. Auto-reloading to apply...');
                window.location.reload();
              }
            };
          }
        };
      }).catch((err) => {
        console.error('ServiceWorker registration failed: ', err);
      });

      // Binds page reload once when the new active service worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main>
      {!session ? <AuthForm /> : <Dashboard session={session} />}
    </main>
  );
}
