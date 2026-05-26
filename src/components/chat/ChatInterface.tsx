"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Send, Hash, User as UserIcon, Loader2, MessageSquare,
  Plus, X, Check, Paperclip, Smile, Trash2, Maximize2,
  Bell, BellOff, FileText, Download, Phone
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ALL_INTERNS_CHAT_ID = "00000000-0000-0000-0000-000000000001";

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => { blob ? resolve(blob) : resolve(file); }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type Chat = {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url?: string | null;
  other_user_id?: string;
  other_user_phone?: string | null;
  other_user_department?: string | null;
  other_user_office?: string | null;
  other_user_floor?: string | null;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  image_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  is_deleted?: boolean;
  sender?: { id: string; full_name: string; avatar_url: string | null; office: string; department: string; floor: string; };
  message_reactions?: { id: string; message_id: string; user_id: string; emoji: string; }[];
};

export default function ChatInterface({
  session,
  onlineUsers = []
}: {
  session: any;
  onlineUsers?: string[];
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherMemberLastRead, setOtherMemberLastRead] = useState<string | null>(null);
  const [activeReactionMenuId, setActiveReactionMenuId] = useState<string | null>(null);
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // messageId awaiting confirm
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChatRef = useRef<Chat | null>(null);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // Dismiss reaction menu on click outside
  useEffect(() => {
    const handle = () => setActiveReactionMenuId(null);
    if (activeReactionMenuId) window.addEventListener('click', handle);
    return () => window.removeEventListener('click', handle);
  }, [activeReactionMenuId]);

  useEffect(() => { fetchChats(); }, []);

  // Reaction sync
  useEffect(() => {
    const ch = supabase.channel('reactions-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        if (activeChatRef.current) fetchMessages(activeChatRef.current.id);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Global new messages / memberships
  useEffect(() => {
    if (!session?.user?.id) return;
    const memberCh = supabase.channel('my-memberships')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members', filter: `user_id=eq.${session.user.id}` }, () => { fetchChats(); })
      .subscribe();
    const globalMsgCh = supabase.channel('global-message-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const incomingChatId = payload.new.chat_id;
        if (payload.new.sender_id !== session.user.id) {
          setChats(prev => {
            const belongsToMe = prev.some(c => c.id === incomingChatId);
            const isActive = activeChatRef.current?.id === incomingChatId;
            const isMuted = mutedChats.has(incomingChatId);
            if (belongsToMe && !isActive && !isMuted) {
              setUnreadCounts(u => ({ ...u, [incomingChatId]: (u[incomingChatId] || 0) + 1 }));
            }
            return prev;
          });
        }
      }).subscribe();
    return () => { supabase.removeChannel(memberCh); supabase.removeChannel(globalMsgCh); };
  }, [session?.user?.id, mutedChats]);

  // Active chat subscription
  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
      updateLastRead(activeChat.id);
      setTypingUsers({});

      const channel = supabase.channel(`chat_${activeChat.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` }, async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data: senderData } = await supabase.from('users').select('id, full_name, avatar_url, office, department, floor').eq('id', payload.new.sender_id).single();
            const newMsg = { ...payload.new, sender: senderData, message_reactions: [] } as unknown as Message;
            setMessages(prev => { if (prev.some(m => m.id === newMsg.id)) return prev; return [...prev, newMsg]; });
            scrollToBottom();
            if (activeChatRef.current?.id) await updateLastRead(activeChatRef.current.id);
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload.userId !== session.user.id) {
            if (payload.isTyping) {
              setTypingUsers(prev => ({ ...prev, [payload.userId]: payload.userName }));
            } else {
              setTypingUsers(prev => { const next = { ...prev }; delete next[payload.userId]; return next; });
            }
          }
        }).subscribe();

      const readCh = supabase.channel(`read_receipts_${activeChat.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${activeChat.id}` }, (payload) => {
          if (activeChatRef.current && !activeChatRef.current.is_group && payload.new.user_id === activeChatRef.current.other_user_id) {
            setOtherMemberLastRead(payload.new.last_read_at);
          }
        }).subscribe();

      return () => { supabase.removeChannel(channel); supabase.removeChannel(readCh); };
    }
  }, [activeChat]);

  const scrollToBottom = (instant = false) => {
    setTimeout(() => {
      const el = messagesEndRef.current;
      if (!el) return;
      const container = el.parentElement;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: instant ? "instant" : "smooth" });
      }
    }, 50);
  };

  const fetchChats = async () => {
    setLoadingChats(true);
    try {
      // Dept group sync
      const { data: profile } = await supabase.from('users').select('department').eq('id', session.user.id).single();
      if (profile?.department) {
        const { data: deptChat } = await supabase.from('chats').select('*').eq('is_group', true).eq('name', profile.department).maybeSingle();
        if (!deptChat) {
          const { data: newChat } = await supabase.from('chats').insert({ is_group: true, name: profile.department }).select().single();
          if (newChat) await supabase.from('chat_members').insert({ chat_id: newChat.id, user_id: session.user.id });
        } else {
          const { data: isMember } = await supabase.from('chat_members').select('*').eq('chat_id', deptChat.id).eq('user_id', session.user.id).maybeSingle();
          if (!isMember) await supabase.from('chat_members').insert({ chat_id: deptChat.id, user_id: session.user.id });
        }
      }
    } catch (err) { console.error("Dept sync error:", err); }

    const { data: membershipData } = await supabase.from('chat_members').select('chat_id, last_read_at, is_muted').eq('user_id', session.user.id);

    if (membershipData && membershipData.length > 0) {
      // Track muted chats
      const muted = new Set(membershipData.filter((m: any) => m.is_muted).map((m: any) => m.chat_id));
      setMutedChats(muted);

      const chatIds = membershipData.map((m: any) => m.chat_id);
      const { data: chatsData } = await supabase.from('chats').select('*').in('id', chatIds);

      if (chatsData) {
        const formatted = await Promise.all(chatsData.map(async (c: any) => {
          const myRecord = membershipData.find((m: any) => m.chat_id === c.id);
          const lastReadAt = myRecord?.last_read_at || new Date(0).toISOString();
          const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('chat_id', c.id).gt('created_at', lastReadAt).neq('sender_id', session.user.id);
          if (!myRecord?.is_muted) setUnreadCounts(prev => ({ ...prev, [c.id]: count || 0 }));

          if (!c.is_group) {
            const { data: otherMember } = await supabase.from('chat_members').select('user_id').eq('chat_id', c.id).neq('user_id', session.user.id).maybeSingle();
            if (otherMember) {
              const { data: userProfile } = await supabase.from('users').select('full_name, avatar_url, phone, department, office, floor').eq('id', otherMember.user_id).maybeSingle();
              c.name = userProfile?.full_name || "Unknown User";
              c.avatar_url = userProfile?.avatar_url || null;
              c.other_user_id = otherMember.user_id;
              c.other_user_phone = userProfile?.phone || null;
              c.other_user_department = userProfile?.department || null;
              c.other_user_office = userProfile?.office || null;
              c.other_user_floor = userProfile?.floor || null;
            }
          }
          return c as Chat;
        }));

        // Sort: All Interns pinned first, then alphabetical
        const sorted = formatted.sort((a, b) => {
          if (a.id === ALL_INTERNS_CHAT_ID) return -1;
          if (b.id === ALL_INTERNS_CHAT_ID) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setChats(sorted);
      }
    } else {
      setChats([]);
    }
    setLoadingChats(false);
  };

  const fetchMessages = async (chatId: string) => {
    setLoadingMessages(true);
    const { data } = await supabase.from('messages').select('*, sender:users(id, full_name, avatar_url, office, department, floor), message_reactions(*)').eq('chat_id', chatId).order('created_at', { ascending: true });
    if (data) { setMessages(data as any); scrollToBottom(true); }

    if (activeChatRef.current && !activeChatRef.current.is_group && activeChatRef.current.other_user_id) {
      const { data: otherInfo } = await supabase.from('chat_members').select('last_read_at').eq('chat_id', chatId).eq('user_id', activeChatRef.current.other_user_id).maybeSingle();
      setOtherMemberLastRead(otherInfo?.last_read_at || null);
    } else {
      setOtherMemberLastRead(null);
    }
    setLoadingMessages(false);
  };

  const updateLastRead = async (chatId: string) => {
    await supabase.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', session.user.id);
    setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
  };

  const toggleMute = async () => {
    if (!activeChat) return;
    const isMuted = mutedChats.has(activeChat.id);
    await supabase.from('chat_members').update({ is_muted: !isMuted }).eq('chat_id', activeChat.id).eq('user_id', session.user.id);
    setMutedChats(prev => {
      const next = new Set(prev);
      isMuted ? next.delete(activeChat.id) : next.add(activeChat.id);
      return next;
    });
  };

  const handleInputChange = (val: string) => {
    setNewMessage(val);
    if (activeChat) {
      const ch = supabase.channel(`chat_${activeChat.id}`);
      if (!isTyping) {
        setIsTyping(true);
        ch.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, userName: session.user.user_metadata?.full_name || "Someone", isTyping: true } });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        ch.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, isTyping: false } });
      }, 2500);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;
    const content = newMessage.trim();
    setNewMessage("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsTyping(false);
    supabase.channel(`chat_${activeChat.id}`).send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, isTyping: false } });
    const { error } = await supabase.from('messages').insert({ chat_id: activeChat.id, sender_id: session.user.id, content });
    if (error) { console.error("Send error:", error); setNewMessage(content); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0 || !activeChat) return;
      setUploadingFile(true);
      const file = e.target.files[0];
      const isImage = file.type.startsWith('image/');
      let fileToUpload: File | Blob = file;
      let filePath: string;
      let publicUrl: string;

      if (isImage) {
        const compressed = await compressImage(file, 1024, 1024, 0.75);
        fileToUpload = new File([compressed], file.name, { type: 'image/jpeg' });
        filePath = `${activeChat.id}/${Date.now()}.jpg`;
      } else {
        filePath = `${activeChat.id}/${Date.now()}_${file.name}`;
      }

      const { error: uploadError } = await supabase.storage.from('chat_media').upload(filePath, fileToUpload, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl: url } } = supabase.storage.from('chat_media').getPublicUrl(filePath);
      publicUrl = url;

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: activeChat.id,
        sender_id: session.user.id,
        content: isImage ? '' : file.name,
        image_url: isImage ? publicUrl : null,
        file_name: isImage ? null : file.name,
        file_type: isImage ? null : file.type,
        ...(isImage ? {} : { image_url: publicUrl })
      });
      if (msgError) throw msgError;
      e.target.value = '';
    } catch (err: any) {
      alert("Failed to share file: " + err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      const existing = messages.find(m => m.id === messageId)?.message_reactions?.find(r => r.user_id === session.user.id && r.emoji === emoji);
      if (existing) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('message_reactions').insert({ message_id: messageId, user_id: session.user.id, emoji });
      }
      if (activeChat) fetchMessages(activeChat.id);
    } catch (err: any) { console.error("Reaction error:", err); }
  };

  // Hard delete from both ends — removes the row entirely
  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err: any) {
      alert("Failed to delete: " + err.message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Long press handlers for mobile
  const handleLongPressStart = (msgId: string, isMine: boolean) => {
    if (!isMine) return;
    const timer = setTimeout(() => { setDeleteConfirm(msgId); }, 600);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  };

  const openCreateGroup = async () => {
    setIsCreateGroupOpen(true);
    const { data } = await supabase.from('users').select('*').order('full_name');
    if (data) setAllUsers(data);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setIsCreatingGroup(true);
    const { data: newChat, error: chatError } = await supabase.from('chats').insert({ is_group: true, name: groupName.trim() }).select().single();
    if (newChat) {
      const members = [{ chat_id: newChat.id, user_id: session.user.id }, ...selectedUsers.map(id => ({ chat_id: newChat.id, user_id: id }))];
      const { error: membersError } = await supabase.from('chat_members').insert(members);
      if (!membersError) {
        setIsCreateGroupOpen(false); setGroupName(""); setSelectedUsers([]);
        fetchChats(); setActiveChat(newChat as Chat);
      }
    }
    setIsCreatingGroup(false);
  };

  const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U';

  const isFileMsgImage = (msg: Message) => !!msg.image_url && !msg.file_name;
  const isFileMsgFile = (msg: Message) => !!msg.image_url && !!msg.file_name;

  const getWhatsAppLink = (phone: string) => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    return `https://wa.me/${cleaned}`;
  };

  return (
    <div className="h-full flex flex-col md:flex-row relative bg-transparent text-[var(--text-primary)] min-h-0">

      {/* Chat list sidebar */}
      <div className={`w-full md:w-80 glass-panel border-r border-zinc-800/60 flex flex-col min-h-0 ${activeChat ? 'hidden md:flex' : 'flex'} z-10`}>
        <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/20">
          <h2 className="font-semibold text-[var(--text-primary)]">Your Chats</h2>
          <button onClick={openCreateGroup} className="p-2 bg-zinc-800/60 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loadingChats ? (
            <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500 mt-10">No chats yet. Go to Directory to start one!</div>
          ) : (
            <div className="p-2 space-y-0.5">
              {chats.map(chat => {
                const isOnline = chat.other_user_id ? onlineUsers.includes(chat.other_user_id) : false;
                const unread = unreadCounts[chat.id] || 0;
                const isMuted = mutedChats.has(chat.id);
                const isAllInterns = chat.id === ALL_INTERNS_CHAT_ID;
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative ${activeChat?.id === chat.id ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-zinc-800/40 border border-transparent'}`}
                  >
                    <div className="relative shrink-0">
                      {chat.is_group ? (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner ${isAllInterns ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-indigo-500 to-violet-600'} text-white`}>
                          <Hash className="w-5 h-5" />
                        </div>
                      ) : chat.avatar_url ? (
                        <img src={chat.avatar_url} alt={chat.name || "User"} className="w-10 h-10 rounded-full object-cover border border-zinc-800 shadow-md" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 font-bold text-sm flex items-center justify-center border border-zinc-700 shadow-inner">{getInitials(chat.name || "")}</div>
                      )}
                      {!chat.is_group && isOnline && (<span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-md animate-pulse" />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h3 className={`font-medium truncate pr-2 text-sm ${activeChat?.id === chat.id ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                          {chat.name}
                          {isAllInterns && <span className="ml-1.5 text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold">PINNED</span>}
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isMuted && <BellOff className="w-3 h-3 text-zinc-600" />}
                          {unread > 0 && !isMuted && (
                            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg shadow-rose-500/25 min-w-[18px] text-center">{unread}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{chat.is_group ? (isAllInterns ? '🏢 All Interns' : 'Custom Group') : 'Direct Message'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Active Chat Panel */}
      {activeChat ? (
        <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 relative bg-transparent">

          {/* Chat Header */}
          <div className="px-4 py-3 glass-panel border-b border-zinc-800/60 flex items-center gap-3 z-10 shadow-sm shrink-0">
            <button className="md:hidden text-indigo-400 font-medium text-sm hover:text-indigo-300 mr-1 shrink-0" onClick={() => setActiveChat(null)}>
              ← Back
            </button>
            <div className="relative shrink-0">
              {activeChat.is_group ? (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${activeChat.id === ALL_INTERNS_CHAT_ID ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-indigo-500 to-violet-600'}`}>
                  <Hash className="w-4 h-4" />
                </div>
              ) : activeChat.avatar_url ? (
                <img src={activeChat.avatar_url} alt={activeChat.name || "User"} className="w-9 h-9 rounded-full object-cover border border-zinc-800" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-400 font-bold text-sm flex items-center justify-center border border-zinc-700">{getInitials(activeChat.name || "")}</div>
              )}
              {!activeChat.is_group && activeChat.other_user_id && onlineUsers.includes(activeChat.other_user_id) && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-[var(--text-primary)] text-sm leading-none truncate">{activeChat.name}</h2>
              <span className="text-[10px] text-zinc-500 font-medium flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                <span>{activeChat.is_group ? (activeChat.id === ALL_INTERNS_CHAT_ID ? 'All HPCL Interns' : 'Group Workspace') : activeChat.other_user_id && onlineUsers.includes(activeChat.other_user_id) ? '🟢 Online' : 'Offline'}</span>
                {!activeChat.is_group && (activeChat.other_user_department || activeChat.other_user_office || activeChat.other_user_floor) && (
                  <>
                    <span className="text-zinc-600/80">•</span>
                    <span className="text-indigo-400 font-medium">
                      {[
                        activeChat.other_user_department,
                        activeChat.other_user_office,
                        activeChat.other_user_floor ? `${activeChat.other_user_floor} Floor` : null
                      ].filter(Boolean).join(' • ')}
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Action buttons in header */}
            <div className="flex items-center gap-2 shrink-0">
              {/* WhatsApp button — DMs only */}
              {!activeChat.is_group && activeChat.other_user_phone && (
                <a
                  href={getWhatsAppLink(activeChat.other_user_phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 transition-all"
                  title="Chat on WhatsApp"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              {/* Mute/Unmute — groups */}
              {activeChat.is_group && (
                <button
                  onClick={toggleMute}
                  title={mutedChats.has(activeChat.id) ? "Unmute" : "Mute notifications"}
                  className={`p-2 rounded-xl border transition-all ${mutedChats.has(activeChat.id) ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'}`}
                >
                  {mutedChats.has(activeChat.id) ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 md:p-4 space-y-4 relative z-0">
            {loadingMessages ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map(msg => {
                  const isMe = msg.sender_id === session.user.id;
                  const isDeleted = msg.is_deleted;
                  const isRead = otherMemberLastRead && new Date(msg.created_at) <= new Date(otherMemberLastRead);
                  const reactionsGrouped = msg.message_reactions?.reduce((acc: any, r: any) => {
                    acc[r.emoji] = acc[r.emoji] || []; acc[r.emoji].push(r.user_id); return acc;
                  }, {} as Record<string, string[]>);

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className={`flex flex-col relative group no-select ${isMe ? 'items-end' : 'items-start'}`}
                      onMouseEnter={() => !isDeleted && setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      onTouchStart={() => handleLongPressStart(msg.id, isMe)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                    >
                      <div className={`flex gap-2 max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        {!isMe && (
                          <div className="relative shrink-0 self-end mb-5">
                            {msg.sender?.avatar_url ? (
                              <img src={msg.sender.avatar_url} alt={msg.sender.full_name} className="w-7 h-7 rounded-full object-cover border border-zinc-800" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 font-bold text-[10px] flex items-center justify-center border border-zinc-700">{getInitials(msg.sender?.full_name || "")}</div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col min-w-0">
                          {!isMe && activeChat.is_group && (
                            <span className="text-[10px] font-semibold text-indigo-400 mb-1 ml-1">{msg.sender?.full_name}</span>
                          )}

                          <div className={`relative px-3 py-2.5 shadow-md ${isDeleted
                            ? 'bg-zinc-900/40 border border-dashed border-zinc-800 text-zinc-500 rounded-2xl italic'
                            : isMe
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl rounded-br-sm'
                              : 'glass-panel text-[var(--text-primary)] rounded-2xl rounded-bl-sm border border-zinc-800/60'
                          }`}>
                            {isDeleted ? (
                              <p className="text-xs">This message was deleted</p>
                            ) : (
                              <>
                                {/* Image attachment */}
                                {isFileMsgImage(msg) && (
                                  <div className="relative mb-1.5 rounded-lg overflow-hidden cursor-pointer group/img" onClick={() => setSelectedImage(msg.image_url || null)}>
                                    <img src={msg.image_url!} alt="Attachment" className="max-h-56 max-w-full object-contain rounded-lg hover:scale-[1.02] transition-transform" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                                      <Maximize2 className="w-4 h-4 mr-1" /> View
                                    </div>
                                  </div>
                                )}
                                {/* File attachment */}
                                {isFileMsgFile(msg) && (
                                  <a href={msg.image_url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 transition-colors mb-1.5 group/file">
                                    <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                                      <FileText className="w-4 h-4 text-indigo-300" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold truncate text-white">{msg.file_name}</p>
                                      <p className="text-[10px] text-white/60">{msg.file_type?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                                    </div>
                                    <Download className="w-4 h-4 text-white/60 group-hover/file:text-white shrink-0 transition-colors" />
                                  </a>
                                )}
                                {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}
                              </>
                            )}

                            {/* Reaction popover */}
                            <AnimatePresence>
                              {activeReactionMenuId === msg.id && (
                                <motion.div
                                  initial={{ scale: 0.85, opacity: 0, y: 10 }}
                                  animate={{ scale: 1, opacity: 1, y: 0 }}
                                  exit={{ scale: 0.85, opacity: 0, y: 10 }}
                                  transition={{ type: "spring", stiffness: 450, damping: 25 }}
                                  className={`absolute -top-14 z-30 flex items-center gap-1 p-1.5 bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-800/90 ${isMe ? 'right-0' : 'left-0'}`}
                                >
                                  {['❤️', '👍', '🔥', '😂', '😮', '😢', '👏'].map(emoji => (
                                    <motion.button key={emoji} type="button"
                                      onClick={(e) => { e.stopPropagation(); handleReaction(msg.id, emoji); setActiveReactionMenuId(null); }}
                                      whileHover={{ scale: 1.35, y: -4 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                      className="px-1 py-0.5 text-lg cursor-pointer"
                                    >{emoji}</motion.button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Reaction pills */}
                          {!isDeleted && reactionsGrouped && Object.keys(reactionsGrouped).length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(reactionsGrouped).map(([emoji, usersArr]: any) => {
                                const hasMyReaction = usersArr.includes(session.user.id);
                                return (
                                  <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border transition-all ${hasMyReaction ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                                  >
                                    <span>{emoji}</span><span className="text-[10px] font-semibold">{usersArr.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Hover action buttons */}
                        {!isDeleted && (
                          <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all self-center shrink-0 pointer-events-none group-hover:pointer-events-auto ${isMe ? 'mr-1' : 'ml-1'}`}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setActiveReactionMenuId(activeReactionMenuId === msg.id ? null : msg.id); }}
                              className="p-1.5 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-indigo-400 transition-all shadow cursor-pointer"
                              title="React"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            {/* Delete available for sender only */}
                            {isMe && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(msg.id); }}
                                className="p-1.5 bg-zinc-900/90 hover:bg-rose-950/50 border border-zinc-800 hover:border-rose-900/50 rounded-xl text-zinc-400 hover:text-rose-400 transition-all shadow cursor-pointer"
                                title="Delete for everyone"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timestamp + read receipt */}
                      <div className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1 px-1 font-medium tracking-wide">
                        {isMe ? (
                          <span className="flex items-center gap-1">
                            Sent
                            {!activeChat.is_group && (
                              <span className={`flex leading-none -space-x-1 text-xs font-bold ${isRead ? 'text-indigo-400' : 'text-zinc-600'}`}>
                                <span>✓</span><span>✓</span>
                              </span>
                            )}
                          </span>
                        ) : (
                          `${msg.sender?.department || ''} • ${msg.sender?.office || ''}${msg.sender?.floor ? ` • Floor ${msg.sender.floor}` : ''}`
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {/* Typing indicator */}
            <AnimatePresence>
              {Object.keys(typingUsers).length > 0 && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                  className="flex items-center gap-2 p-3 glass-panel rounded-2xl border border-zinc-800 text-xs text-indigo-400 max-w-[200px]"
                >
                  <div className="flex gap-1 items-center shrink-0">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                  <span className="truncate">{Object.values(typingUsers).join(", ")} is typing...</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="px-3 py-3 glass-panel border-t border-zinc-800/60 z-10 relative shrink-0 safe-bottom">
            {uploadingFile && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center gap-2 text-indigo-400 text-sm font-semibold z-20 backdrop-blur-sm rounded-t-xl">
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading...
              </div>
            )}
            <form onSubmit={sendMessage} className="flex gap-2 items-center">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 glass-input flex items-center justify-center text-zinc-400 hover:text-indigo-400 shrink-0 cursor-pointer transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input type="file" ref={fileInputRef} accept="*/*" onChange={handleFileUpload} className="hidden" />
              <input
                type="text"
                value={newMessage}
                onChange={e => handleInputChange(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 glass-input text-sm text-[var(--text-primary)] placeholder:text-zinc-500"
              />
              <button type="submit" disabled={!newMessage.trim()}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 flex items-center justify-center text-white disabled:opacity-40 transition-all shrink-0 shadow-lg shadow-indigo-500/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-transparent relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="text-center z-10">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800 shadow-xl">
              <MessageSquare className="w-10 h-10 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">Your Workspace</h3>
            <p className="text-sm text-zinc-500 max-w-xs">Select a chat from the sidebar or find someone in the Directory to start messaging.</p>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel rounded-2xl p-6 max-w-sm w-full border border-zinc-800 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-rose-500/10 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-rose-500/20">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-center text-[var(--text-primary)] mb-1">Delete Message?</h3>
              <p className="text-xs text-zinc-500 text-center mb-5">This will be permanently deleted for everyone in the chat.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Cancel</button>
                <button onClick={() => deleteMessage(deleteConfirm)} className="flex-1 py-2.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]"
          >
            <button onClick={() => setSelectedImage(null)} className="absolute top-4 right-4 p-2 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 rounded-full text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
            <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              src={selectedImage} alt="Expanded" className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {isCreateGroupOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col border border-zinc-800"
            >
              <div className="p-5 border-b border-zinc-800/50 flex justify-between items-center">
                <h2 className="font-semibold text-lg text-[var(--text-primary)]">Create Custom Group</h2>
                <button onClick={() => setIsCreateGroupOpen(false)} className="text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 border-b border-zinc-800/50">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Group Name</label>
                <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Project Alpha Team" className="w-full px-4 py-3 glass-input text-sm text-[var(--text-primary)]" />
              </div>
              <div className="p-5 border-b border-zinc-800/50 flex-1 min-h-0 flex flex-col">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Select Members</label>
                <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search interns..." className="w-full px-4 py-3 mb-4 glass-input text-sm text-[var(--text-primary)]" />
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {allUsers.filter(u => u.id !== session.user.id && (u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.department?.toLowerCase().includes(userSearch.toLowerCase()))).map(user => {
                    const isSelected = selectedUsers.includes(user.id);
                    return (
                      <div key={user.id} onClick={() => setSelectedUsers(prev => isSelected ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-900/50 border-transparent hover:bg-zinc-800'}`}
                      >
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? <img src={user.avatar_url} alt={user.full_name} className="w-9 h-9 rounded-full object-cover border border-zinc-800" /> : (
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{getInitials(user.full_name)}</div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{user.full_name}</p>
                            <p className="text-xs text-zinc-500">{user.department}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-zinc-700 bg-zinc-800'}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 flex justify-end gap-3">
                <button onClick={() => setIsCreateGroupOpen(false)} className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
                <button onClick={handleCreateGroup} disabled={!groupName.trim() || selectedUsers.length === 0 || isCreatingGroup}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium rounded-xl hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                  {isCreatingGroup && <Loader2 className="w-4 h-4 animate-spin" />} Create Group
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
