"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { Search, MessageSquare, Loader2, User as UserIcon, Filter, Building2, MapPin, GraduationCap, Clock } from "lucide-react";
import { motion } from "framer-motion";

type UserProfile = {
  id: string;
  full_name: string;
  department: string;
  office: string;
  floor: string;
  avatar_url?: string;
  college_name?: string | null;
  study_year?: string | null;
  last_seen_at?: string | null;
};

const formatLastSeen = (dateString?: string | null) => {
  if (!dateString) return "Offline";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return "Offline";
  }
};

export default function Directory({ onlineUsers = [], onStartChat }: { onlineUsers?: string[]; onStartChat?: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [creatingChatFor, setCreatingChatFor] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('full_name', { ascending: true });
      
    if (data) setUsers(data as UserProfile[]);
    setLoading(false);
  };

  const getInitials = (name: string) => {
    return name
      ? name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "U";
  };

  const startChat = async (otherUserId: string) => {
    if (creatingChatFor) return; // prevent double-click race condition
    setCreatingChatFor(otherUserId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const myId = sessionData.session?.user.id;
      if (!myId) return;

      // Check if a 1-on-1 DM already exists between the two users
      const { data: existingMemberships } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', myId);

      if (existingMemberships && existingMemberships.length > 0) {
        const chatIds = existingMemberships.map(m => m.chat_id);
        
        const { data: sharedChats } = await supabase
          .from('chat_members')
          .select('chat_id, chats!inner(is_group)')
          .in('chat_id', chatIds)
          .eq('user_id', otherUserId)
          .eq('chats.is_group', false);

        if (sharedChats && sharedChats.length > 0) {
          // DM already exists — just switch to chats tab
          onStartChat?.();
          return;
        }
      }

      // Create new DM chat
      const { data: newChat } = await supabase
        .from('chats')
        .insert({ is_group: false })
        .select()
        .single();

      if (newChat) {
        await supabase.from('chat_members').insert([
          { chat_id: newChat.id, user_id: myId },
          { chat_id: newChat.id, user_id: otherUserId }
        ]);
        onStartChat?.(); // switch to chats tab
      }
    } finally {
      setCreatingChatFor(null);
    }
  };

  const departments = useMemo(() => {
    const deps = new Set(users.map(u => u.department));
    return ["All", ...Array.from(deps)].sort();
  }, [users]);

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) || u.office.toLowerCase().includes(search.toLowerCase());
    const matchesDep = departmentFilter === "All" || u.department === departmentFilter;
    return matchesSearch && matchesDep;
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="h-full flex flex-col bg-transparent text-zinc-100">
      <div className="p-6 md:p-8 glass-panel border-b border-zinc-800 z-10 sticky top-0 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent mb-6">Intern Directory</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search interns by name or office..."
                className="w-full pl-11 pr-4 py-3 glass-input text-sm text-zinc-100 placeholder:text-zinc-500 shadow-sm"
              />
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500" />
            </div>
            <div className="relative min-w-[200px]">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full pl-11 pr-10 py-3 glass-input text-sm appearance-none cursor-pointer text-zinc-100 shadow-sm"
              >
                {departments.map(dep => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
              <Filter className="absolute left-4 top-3.5 h-4 w-4 text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-transparent">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center p-12 glass-panel rounded-2xl border border-zinc-800">
              <UserIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 font-medium">No interns found matching your filters.</p>
            </div>
          ) : (
            <motion.div 
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredUsers.map(user => (
                <motion.div 
                  key={user.id} 
                  variants={item}
                  className="glass-panel p-5 rounded-2xl border border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-900/80 transition-all group shadow-md"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 shrink-0">
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.full_name} 
                            className="w-12 h-12 rounded-full object-cover border border-zinc-800 shadow-md group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-600/20 text-indigo-400 font-bold text-sm flex items-center justify-center border border-indigo-500/20 shadow-md group-hover:scale-105 transition-transform">
                            {getInitials(user.full_name)}
                          </div>
                        )}
                        {onlineUsers.includes(user.id) && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-md animate-pulse" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-100">{user.full_name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {user.department}
                          </span>
                          {user.college_name && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {user.college_name}
                            </span>
                          )}
                          {user.study_year && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20">
                              {user.study_year}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-5">
                    <div className="flex items-center text-sm text-zinc-400">
                      <Building2 className="w-4 h-4 mr-2 text-zinc-500 shrink-0" />
                      <span className="truncate">{user.office} • Floor {user.floor}</span>
                    </div>
                    {(user.college_name || user.study_year) && (
                      <div className="flex items-center text-sm text-zinc-400">
                        <GraduationCap className="w-4 h-4 mr-2 text-indigo-400 shrink-0" />
                        <span className="truncate">
                          {[user.college_name, user.study_year].filter(Boolean).join(' • ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center text-sm text-zinc-400">
                      <Clock className="w-4 h-4 mr-2 text-zinc-500 shrink-0" />
                      <span className="truncate text-xs">
                        {onlineUsers.includes(user.id) ? (
                          <span className="text-emerald-400 font-medium">Active now</span>
                        ) : (
                          <span className="text-zinc-500">Last active: {formatLastSeen(user.last_seen_at)}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => startChat(user.id)}
                    disabled={creatingChatFor === user.id}
                    className="w-full py-2.5 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white rounded-xl transition-all font-medium text-sm border border-zinc-700 hover:border-indigo-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingChatFor === user.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MessageSquare className="w-4 h-4" />}
                    {creatingChatFor === user.id ? "Opening..." : "Message"}
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
