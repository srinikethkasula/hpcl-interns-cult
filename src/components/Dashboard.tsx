"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { MessageSquare, Users, Settings as SettingsIcon, LogOut, Menu, X } from "lucide-react";
import { setupFCM } from "@/lib/firebase/client";
import ChatInterface from "./chat/ChatInterface";
import Directory from "./directory/Directory";
import Settings from "./settings/Settings";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard({ session }: { session: any }) {
  const [currentTab, setCurrentTab] = useState<"chats" | "directory" | "settings">("chats");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    setupFCM();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchMyProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      if (data) {
        setCurrentUserProfile(data);
      }
    };
    
    fetchMyProfile();

    // Sync profile updates globally in real-time
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
      config: {
        presence: {
          key: session.user.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = Object.keys(state);
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [session]);

  const tabs = [
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "directory", label: "Directory", icon: Users },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ] as const;

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const pageVariants = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.98 }
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 flex flex-col md:flex-row overflow-hidden text-zinc-100 relative">
      {/* Dynamic Ambient Nebula Glows behind the glass panels */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-violet-600/10 blur-[130px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-[30%] left-[25%] w-[45%] h-[45%] bg-indigo-500/8 blur-[150px] rounded-full pointer-events-none z-0" />

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 glass-panel border-b border-zinc-800/60 z-20 relative">
        <h1 className="font-bold text-lg bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">HPCL Cult</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-zinc-400 hover:text-white">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <nav className={`${isMobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-20 lg:w-64 glass-panel border-r border-zinc-800/60 z-10 absolute md:relative top-[60px] md:top-0 left-0 h-[calc(100vh-60px)] md:h-full`}>
        <div className="hidden md:flex p-6 border-b border-zinc-800">
          <h1 className="font-bold text-xl lg:block hidden bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">HPCL Cult</h1>
          <h1 className="font-bold text-xl lg:hidden text-center w-full">H</h1>
        </div>

        <div className="flex-1 px-3 py-6 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setCurrentTab(tab.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all relative ${isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab" 
                    className="absolute inset-0 bg-indigo-500/20 border border-indigo-500/30 rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5 relative z-10" />
                <span className="font-medium lg:block md:hidden relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Current User Profile Bar */}
        {session?.user && (
          <>
            {/* Expanded view for wide screen */}
            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/10 lg:block hidden">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  {currentUserProfile?.avatar_url ? (
                    <img 
                      src={currentUserProfile.avatar_url} 
                      alt="My Avatar" 
                      className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/20">
                      {currentUserProfile?.full_name ? currentUserProfile.full_name.split(' ').map((n: any) => n[0]).slice(0, 2).join('').toUpperCase() : 'U'}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-100 truncate">{currentUserProfile?.full_name || "Loading..."}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{session.user.phone}</p>
                </div>
              </div>
            </div>
            
            {/* Condensed icon view for narrow screens */}
            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/10 flex justify-center lg:hidden md:block hidden">
              <div className="relative shrink-0">
                {currentUserProfile?.avatar_url ? (
                  <img 
                    src={currentUserProfile.avatar_url} 
                    alt="My Avatar" 
                    className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/20">
                    {currentUserProfile?.full_name ? currentUserProfile.full_name.split(' ').map((n: any) => n[0]).slice(0, 2).join('').toUpperCase() : 'U'}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
            </div>
          </>
        )}

        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium lg:block md:hidden">Log Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden bg-transparent z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {currentTab === "chats" && <ChatInterface session={session} onlineUsers={onlineUsers} />}
            {currentTab === "directory" && <Directory onlineUsers={onlineUsers} onStartChat={() => setCurrentTab("chats")} />}
            {currentTab === "settings" && <Settings session={session} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
