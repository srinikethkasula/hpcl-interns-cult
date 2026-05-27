"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { MessageSquare, Users, Settings as SettingsIcon, LogOut } from "lucide-react";
import { setupFCM } from "@/lib/firebase/client";
import ChatInterface from "./chat/ChatInterface";
import Directory from "./directory/Directory";
import Settings from "./settings/Settings";
import BottomNav from "./BottomNav";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "chats" | "directory" | "settings";

export default function Dashboard({ session }: { session: any }) {
  const [currentTab, setCurrentTab] = useState<Tab>("chats");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    const initFCM = async () => {
      const token = await setupFCM();
      if (token && session?.user?.id) {
        await supabase
          .from('users')
          .update({ fcm_token: token })
          .eq('id', session.user.id);
        console.log("FCM Token synchronized with database.");
      }
    };
    initFCM();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchMyProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      if (data) setCurrentUserProfile(data);
    };
    fetchMyProfile();

    const profileChannel = supabase
      .channel('my-profile-sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${session.user.id}`
      }, (payload) => {
        setCurrentUserProfile({
          full_name: payload.new.full_name,
          avatar_url: payload.new.avatar_url
        });
      })
      .subscribe();

    const presenceChannel = supabase.channel("online-presence", {
      config: { presence: { key: session.user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUsers(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [session]);

  const tabs = [
    { id: "chats" as Tab, label: "Chats", icon: MessageSquare },
    { id: "directory" as Tab, label: "Directory", icon: Users },
    { id: "settings" as Tab, label: "Settings", icon: SettingsIcon },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const pageVariants = {
    initial: { opacity: 0, y: 8, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.99 }
  };

  const getInitials = (name: string) =>
    name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U';

  return (
    <div className="h-[100dvh] bg-[var(--bg-primary)] flex flex-col overflow-hidden text-[var(--text-primary)] relative">
      {/* Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-violet-600/10 blur-[130px] rounded-full pointer-events-none z-0" />

      {/* Desktop layout: sidebar + main */}
      <div className="flex flex-1 min-h-0 md:flex-row">

        {/* Desktop Sidebar — hidden on mobile */}
        <nav className="hidden md:flex flex-col md:w-20 lg:w-64 glass-panel border-r border-zinc-800/60 z-10 shrink-0">
          <div className="p-5 border-b border-zinc-800/60">
            <h1 className="font-bold text-lg lg:block hidden bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent leading-tight">
              HPCL Intern<br />Connect
            </h1>
            <h1 className="font-bold text-xl lg:hidden text-center w-full text-indigo-400">H</h1>
          </div>

          <div className="flex-1 px-3 py-5 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all relative ${
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-indigo-500/20 border border-indigo-500/30 rounded-xl"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-5 h-5 relative z-10 shrink-0" />
                  <span className="font-medium lg:block hidden relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* User profile bar */}
          {session?.user && (
            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/10 lg:flex hidden items-center gap-3">
              <div className="relative shrink-0">
                {currentUserProfile?.avatar_url ? (
                  <img src={currentUserProfile.avatar_url} alt="My Avatar" className="w-9 h-9 rounded-full object-cover border border-zinc-800" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/20">
                    {getInitials(currentUserProfile?.full_name || '')}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-100 truncate">{currentUserProfile?.full_name || "Loading..."}</p>
                <p className="text-[10px] text-zinc-500 truncate">{session.user.phone}</p>
              </div>
            </div>
          )}

          {/* Condensed avatar for md screens */}
          {session?.user && (
            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/10 lg:hidden flex justify-center">
              <div className="relative">
                {currentUserProfile?.avatar_url ? (
                  <img src={currentUserProfile.avatar_url} alt="My Avatar" className="w-9 h-9 rounded-full object-cover border border-zinc-800" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/20">
                    {getInitials(currentUserProfile?.full_name || '')}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
            </div>
          )}

          <div className="p-3 border-t border-zinc-800">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium lg:block hidden">Log Out</span>
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 relative overflow-hidden bg-transparent z-10 min-h-0 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute inset-0"
            >
              {currentTab === "chats" && <ChatInterface session={session} onlineUsers={onlineUsers} />}
              {currentTab === "directory" && <Directory onlineUsers={onlineUsers} onStartChat={() => setCurrentTab("chats")} />}
              {currentTab === "settings" && <Settings session={session} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
}
