"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { 
  Send, 
  Hash, 
  User as UserIcon, 
  Loader2, 
  MessageSquare, 
  Plus, 
  X, 
  Check, 
  Paperclip, 
  Image as ImageIcon, 
  Smile, 
  Trash2, 
  Maximize2 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

type Chat = {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url?: string | null;
  other_user_id?: string;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  image_url?: string | null;
  is_deleted?: boolean;
  sender?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    office: string;
    department: string;
    floor: string;
  };
  message_reactions?: {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
  }[];
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
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Realtime & UI States
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherMemberLastRead, setOtherMemberLastRead] = useState<string | null>(null);
  const [activeReactionMenuId, setActiveReactionMenuId] = useState<string | null>(null);
  
  // Create Group States
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

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Dismiss reaction menu on any window click
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveReactionMenuId(null);
    };
    if (activeReactionMenuId) {
      window.addEventListener('click', handleGlobalClick);
    }
    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [activeReactionMenuId]);

  useEffect(() => {
    fetchChats();
  }, []);

  // Set up reaction synchronizer
  useEffect(() => {
    const reactionChannel = supabase
      .channel('reactions-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions'
      }, () => {
        if (activeChatRef.current) fetchMessages(activeChatRef.current.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(reactionChannel);
    };
  }, []);

  // Global Realtime listeners for new chats and background messages
  useEffect(() => {
    if (!session?.user?.id) return;

    // Listen for new chat memberships added for this user (group or DM)
    const memberChannel = supabase
      .channel('my-memberships')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_members',
        filter: `user_id=eq.${session.user.id}`
      }, () => {
        fetchChats();
      })
      .subscribe();

    // Listen for incoming messages in all chats to increment unread badges in real-time
    const globalMessageListener = supabase
      .channel('global-message-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const incomingChatId = payload.new.chat_id;
        if (payload.new.sender_id !== session.user.id) {
          setChats(prevChats => {
            const belongsToMe = prevChats.some(c => c.id === incomingChatId);
            const isActive = activeChatRef.current?.id === incomingChatId;
            if (belongsToMe && !isActive) {
              setUnreadCounts(prev => ({
                ...prev,
                [incomingChatId]: (prev[incomingChatId] || 0) + 1
              }));
            }
            return prevChats;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(globalMessageListener);
    };
  }, [session?.user?.id]);

  // Set up messaging & typing synchronizer for the active chat
  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
      updateLastRead(activeChat.id);

      // Clean typing indicators for new chat
      setTypingUsers({});

      const channel = supabase
        .channel(`chat_${activeChat.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${activeChat.id}`
        }, async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data: senderData } = await supabase
              .from('users')
              .select('id, full_name, avatar_url, office, department, floor')
              .eq('id', payload.new.sender_id)
              .single();
              
            const newMsg = {
              ...payload.new,
              sender: senderData,
              message_reactions: []
            } as unknown as Message;
            
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom();
            
            // Instantly mark read since chat is open
            if (activeChatRef.current?.id) {
              await updateLastRead(activeChatRef.current.id);
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload.userId !== session.user.id) {
            if (payload.isTyping) {
              setTypingUsers(prev => ({ ...prev, [payload.userId]: payload.userName }));
            } else {
              setTypingUsers(prev => {
                const next = { ...prev };
                delete next[payload.userId];
                return next;
              });
            }
          }
        })
        .subscribe();

      // Listen to changes in the other member's last_read_at value to update read receipts in real-time!
      const memberReadChannel = supabase
        .channel(`read_receipts_${activeChat.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_members',
          filter: `chat_id=eq.${activeChat.id}`
        }, (payload) => {
          if (activeChatRef.current && !activeChatRef.current.is_group && payload.new.user_id === activeChatRef.current.other_user_id) {
            setOtherMemberLastRead(payload.new.last_read_at);
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(memberReadChannel);
      };
    }
  }, [activeChat]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const fetchChats = async () => {
    setLoadingChats(true);

    // 1. Automatic Department Group Sync
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('department')
        .eq('id', session.user.id)
        .single();
        
      if (profile?.department) {
        // Check if group chat for this department already exists
        const { data: deptChat } = await supabase
          .from('chats')
          .select('*')
          .eq('is_group', true)
          .eq('name', profile.department)
          .maybeSingle();
          
        if (!deptChat) {
          // Create the department group chat
          const { data: newChat } = await supabase
            .from('chats')
            .insert({ is_group: true, name: profile.department })
            .select()
            .single();
            
          if (newChat) {
            await supabase
              .from('chat_members')
              .insert({ chat_id: newChat.id, user_id: session.user.id });
          }
        } else {
          // Verify current user is a member of this department group chat
          const { data: isMember } = await supabase
            .from('chat_members')
            .select('*')
            .eq('chat_id', deptChat.id)
            .eq('user_id', session.user.id)
            .maybeSingle();
            
          if (!isMember) {
            await supabase
              .from('chat_members')
              .insert({ chat_id: deptChat.id, user_id: session.user.id });
          }
        }
      }
    } catch (err) {
      console.error("Error syncing department group chat:", err);
    }

    // 2. Fetch memberships
    const { data: membershipData, error: memError } = await supabase
      .from('chat_members')
      .select('chat_id, last_read_at')
      .eq('user_id', session.user.id);

    if (membershipData && membershipData.length > 0) {
      const chatIds = membershipData.map(m => m.chat_id);

      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .in('id', chatIds);

      if (chatsData) {
        const formattedChats = await Promise.all(chatsData.map(async (c: any) => {
          const myMemberRecord = membershipData.find((m: any) => m.chat_id === c.id);
          const lastReadAt = myMemberRecord?.last_read_at || new Date(0).toISOString();

          // Calculate unread count
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', c.id)
            .gt('created_at', lastReadAt)
            .neq('sender_id', session.user.id);

          setUnreadCounts(prev => ({ ...prev, [c.id]: count || 0 }));

          if (!c.is_group) {
            const { data: otherMember } = await supabase
              .from('chat_members')
              .select('user_id')
              .eq('chat_id', c.id)
              .neq('user_id', session.user.id)
              .maybeSingle();
              
            if (otherMember) {
              const { data: userProfile } = await supabase
                .from('users')
                .select('full_name, avatar_url')
                .eq('id', otherMember.user_id)
                .maybeSingle();
              
              c.name = userProfile?.full_name || "Unknown User";
              c.avatar_url = userProfile?.avatar_url || null;
              c.other_user_id = otherMember.user_id;
            }
          }
          return c as Chat;
        }));
        setChats(formattedChats);
      }
    } else {
      setChats([]);
    }
    setLoadingChats(false);
  };

  const fetchMessages = async (chatId: string) => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from('messages')
      .select('*, sender:users(id, full_name, avatar_url, office, department, floor), message_reactions(*)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
      
    if (data) {
      setMessages(data as any);
      scrollToBottom();
    }

    // Fetch the other user's read timestamp for read receipts
    if (activeChatRef.current && !activeChatRef.current.is_group && activeChatRef.current.other_user_id) {
      const { data: otherMemberInfo } = await supabase
        .from('chat_members')
        .select('last_read_at')
        .eq('chat_id', chatId)
        .eq('user_id', activeChatRef.current.other_user_id)
        .maybeSingle();
        
      if (otherMemberInfo) {
        setOtherMemberLastRead(otherMemberInfo.last_read_at);
      } else {
        setOtherMemberLastRead(null);
      }
    } else {
      setOtherMemberLastRead(null);
    }

    setLoadingMessages(false);
  };

  const updateLastRead = async (chatId: string) => {
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', session.user.id);

    setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
  };

  const handleInputChange = (val: string) => {
    setNewMessage(val);
    
    if (activeChat) {
      // Broadcast typing indicator
      const activeChannel = supabase.channel(`chat_${activeChat.id}`);
      if (!isTyping) {
        setIsTyping(true);
        activeChannel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: session.user.id, userName: session.user.user_metadata?.full_name || "Someone", isTyping: true }
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        activeChannel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: session.user.id, userName: session.user.user_metadata?.full_name || "Someone", isTyping: false }
        });
      }, 2500);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;
    
    const content = newMessage.trim();
    setNewMessage("");
    
    // Clear typing timeout immediately
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsTyping(false);
    
    const activeChannel = supabase.channel(`chat_${activeChat.id}`);
    activeChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: session.user.id, isTyping: false }
    });

    const { error } = await supabase
      .from('messages')
      .insert({
        chat_id: activeChat.id,
        sender_id: session.user.id,
        content: content
      });
      
    if (error) {
      console.error("Error sending message:", error);
      setNewMessage(content);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0 || !activeChat) return;
      setUploadingImage(true);
      
      const file = e.target.files[0];
      
      // Compress shared photo client-side to keep upload and download extremely fast
      const compressedBlob = await compressImage(file, 1024, 1024, 0.75);
      const fileToUpload = new File([compressedBlob], file.name, { type: 'image/jpeg' });
      
      const filePath = `${activeChat.id}/${Date.now()}.jpg`;

      // Upload file to chat_media bucket
      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(filePath, fileToUpload, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat_media')
        .getPublicUrl(filePath);

      // Insert message with media URL
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          chat_id: activeChat.id,
          sender_id: session.user.id,
          content: file.name,
          image_url: publicUrl
        });

      if (msgError) throw msgError;

    } catch (err: any) {
      alert("Failed to share image: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      const existing = messages.find(m => m.id === messageId)
        ?.message_reactions?.find(r => r.user_id === session.user.id && r.emoji === emoji);

      if (existing) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existing.id);
      } else {
        await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: session.user.id,
            emoji: emoji
          });
      }
      
      if (activeChat) fetchMessages(activeChat.id);
    } catch (err: any) {
      console.error("Error toggling reaction:", err);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true })
        .eq('id', messageId);

      if (error) throw error;
      
      if (activeChat) fetchMessages(activeChat.id);
    } catch (err: any) {
      alert("Failed to delete message: " + err.message);
    }
  };

  const openCreateGroup = async () => {
    setIsCreateGroupOpen(true);
    const { data } = await supabase.from('users').select('*').order('full_name');
    if (data) setAllUsers(data);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setIsCreatingGroup(true);

    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({ is_group: true, name: groupName.trim() })
      .select()
      .single();

    if (newChat) {
      const members = [
        { chat_id: newChat.id, user_id: session.user.id },
        ...selectedUsers.map(id => ({ chat_id: newChat.id, user_id: id }))
      ];
      const { error: membersError } = await supabase.from('chat_members').insert(members);
      
      if (membersError) {
        alert("Failed to add members: " + membersError.message);
      } else {
        setIsCreateGroupOpen(false);
        setGroupName("");
        setSelectedUsers([]);
        fetchChats();
        setActiveChat(newChat as Chat);
      }
    } else {
      alert("Error creating group: " + chatError?.message);
    }
    setIsCreatingGroup(false);
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U';
  };

  return (
    <div className="h-full flex flex-col md:flex-row relative bg-transparent text-zinc-100">
      {/* Sidebar */}
      <div className={`w-full md:w-80 glass-panel border-r border-zinc-800 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'} z-10`}>
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h2 className="font-semibold text-zinc-100">Your Chats</h2>
          <button 
            onClick={openCreateGroup}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-300 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500 mt-10">No chats yet. Go to Directory to start one!</div>
          ) : (
            <div className="p-2 space-y-1">
              {chats.map(chat => {
                const isOnline = chat.other_user_id ? onlineUsers.includes(chat.other_user_id) : false;
                const unread = unreadCounts[chat.id] || 0;
                
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 relative ${activeChat?.id === chat.id ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-zinc-800/50 border border-transparent'}`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {chat.is_group ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-inner">
                          <Hash className="w-5 h-5" />
                        </div>
                      ) : chat.avatar_url ? (
                        <img 
                          src={chat.avatar_url} 
                          alt={chat.name || "User"} 
                          className="w-10 h-10 rounded-full object-cover border border-zinc-800 shadow-md"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 font-bold text-sm flex items-center justify-center border border-zinc-700 shadow-inner">
                          {getInitials(chat.name || "")}
                        </div>
                      )}
                      {/* Pulse green dot if online */}
                      {!chat.is_group && isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-md animate-pulse" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="font-medium text-zinc-100 truncate pr-2">{chat.name}</h3>
                        {unread > 0 && (
                          <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-rose-500/25 animate-bounce shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{chat.is_group ? 'Custom Group' : 'Direct Message'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Active Chat */}
      {activeChat ? (
        <div className="flex-1 flex flex-col h-full min-w-0 relative bg-transparent">
          {/* Header */}
          <div className="p-4 glass-panel border-b border-zinc-800 flex items-center gap-3 z-10 shadow-md">
            <button className="md:hidden text-indigo-400 font-medium text-sm hover:text-indigo-300 mr-2" onClick={() => setActiveChat(null)}>
              ← Back
            </button>
            <div className="relative shrink-0">
              {activeChat.is_group ? (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center">
                  <Hash className="w-5 h-5" />
                </div>
              ) : activeChat.avatar_url ? (
                <img 
                  src={activeChat.avatar_url} 
                  alt={activeChat.name || "User"} 
                  className="w-10 h-10 rounded-full object-cover border border-zinc-850"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 font-bold text-sm flex items-center justify-center border border-zinc-700">
                  {getInitials(activeChat.name || "")}
                </div>
              )}
              {!activeChat.is_group && activeChat.other_user_id && onlineUsers.includes(activeChat.other_user_id) && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-md animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-zinc-100 text-sm md:text-base leading-none">{activeChat.name}</h2>
              <span className="text-[10px] text-zinc-500 font-medium">
                {activeChat.is_group ? 'Group Workspace' : activeChat.other_user_id && onlineUsers.includes(activeChat.other_user_id) ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 relative z-0">
            {loadingMessages ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map(msg => {
                  const isMe = msg.sender_id === session.user.id;
                  const isDeleted = msg.is_deleted;
                  const isRead = otherMemberLastRead && new Date(msg.created_at) <= new Date(otherMemberLastRead);
                  
                  // Reactions layout grouping
                  const reactionsGrouped = msg.message_reactions?.reduce((acc: any, r: any) => {
                    acc[r.emoji] = acc[r.emoji] || [];
                    acc[r.emoji].push(r.user_id);
                    return acc;
                  }, {} as Record<string, string[]>);

                  return (
                    <motion.div 
                      key={msg.id} 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className={`flex flex-col relative group ${isMe ? 'items-end' : 'items-start'}`}
                      onMouseEnter={() => !isDeleted && setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      {/* Avatar for other users in group */}
                      <div className={`flex gap-2.5 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        {!isMe && (
                          <div className="relative shrink-0 self-end mb-5">
                            {msg.sender?.avatar_url ? (
                              <img 
                                src={msg.sender.avatar_url} 
                                alt={msg.sender.full_name} 
                                className="w-7 h-7 rounded-full object-cover border border-zinc-800"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 font-bold text-[10px] flex items-center justify-center border border-zinc-700">
                                {getInitials(msg.sender?.full_name || "")}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col">
                          {/* Sender name for group chats */}
                          {!isMe && activeChat.is_group && (
                            <span className="text-[10px] font-semibold text-indigo-400 mb-1 ml-1">{msg.sender?.full_name}</span>
                          )}

                          {/* Message Bubble */}
                          <div className={`relative px-4 py-2.5 shadow-md ${
                            isDeleted 
                              ? 'bg-zinc-900/40 border border-dashed border-zinc-800 text-zinc-500 rounded-2xl italic' 
                              : isMe 
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl rounded-br-sm' 
                                : 'glass-panel text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-800'
                          }`}>
                            {isDeleted ? (
                              <p className="text-xs">This message was deleted</p>
                            ) : (
                              <>
                                {/* Shared Image */}
                                {msg.image_url && (
                                  <div className="relative mb-2 rounded-lg overflow-hidden border border-zinc-800 group/img cursor-pointer" onClick={() => setSelectedImage(msg.image_url || null)}>
                                    <img 
                                      src={msg.image_url} 
                                      alt="Shared attachment" 
                                      className="max-h-60 max-w-full object-contain rounded-lg hover:scale-[1.02] transition-transform" 
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                                      <Maximize2 className="w-4 h-4 mr-1.5" /> View Photo
                                    </div>
                                  </div>
                                )}
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              </>
                            )}

                            {/* Floating Micro Click Menu (Emojis with spring animations) */}
                            <AnimatePresence>
                              {activeReactionMenuId === msg.id && (
                                <motion.div
                                  initial={{ scale: 0.85, opacity: 0, y: 10 }}
                                  animate={{ scale: 1, opacity: 1, y: 0 }}
                                  exit={{ scale: 0.85, opacity: 0, y: 10 }}
                                  transition={{ type: "spring" as const, stiffness: 450, damping: 25 }}
                                  className={`absolute -top-14 z-30 flex items-center gap-1.5 p-1.5 bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-800/90 ${isMe ? 'right-0' : 'left-0'}`}
                                >
                                  {['❤️', '👍', '🔥', '😂', '😮', '😢', '👏'].map(emoji => (
                                    <motion.button 
                                      key={emoji}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReaction(msg.id, emoji);
                                        setActiveReactionMenuId(null);
                                      }}
                                      whileHover={{ scale: 1.35, y: -4 }}
                                      transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
                                      className="px-1.5 py-1 text-lg cursor-pointer transform-gpu"
                                    >
                                      {emoji}
                                    </motion.button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Reaction Pills */}
                          {!isDeleted && reactionsGrouped && Object.keys(reactionsGrouped).length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(reactionsGrouped).map(([emoji, usersArr]: any) => {
                                const hasMyReaction = usersArr.includes(session.user.id);
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                                      hasMyReaction 
                                        ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 shadow-md shadow-indigo-500/10' 
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-[10px] font-semibold">{usersArr.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Action buttons (Smile / Delete) next to the bubble */}
                        {!isDeleted && (
                          <div className={`flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 self-center shrink-0 pointer-events-none ${isMe ? 'mr-2' : 'ml-2'}`}>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMenuId(activeReactionMenuId === msg.id ? null : msg.id);
                              }}
                              className="p-1.5 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800/80 rounded-xl text-zinc-400 hover:text-indigo-400 hover:border-indigo-500/20 transition-all shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 pointer-events-auto"
                              title="React"
                            >
                              <Smile className="w-4 h-4" />
                            </button>
                            {isMe && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMessage(msg.id);
                                }}
                                className="p-1.5 bg-zinc-900/90 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-900/30 rounded-xl text-zinc-400 hover:text-rose-450 transition-all shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 pointer-events-auto"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer Info */}
                      <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1.5 px-1 font-medium tracking-wide">
                        {isMe ? (
                          <span className="flex items-center gap-1">
                            <span>Sent</span>
                            {!activeChat.is_group && (
                              <span className="flex items-center text-xs font-bold leading-none -space-x-1 select-none">
                                {isRead ? (
                                  <span className="text-indigo-400 font-bold flex leading-none -space-x-1">
                                    <span>✓</span>
                                    <span>✓</span>
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 flex leading-none -space-x-1">
                                    <span>✓</span>
                                    <span>✓</span>
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        ) : (
                          `${msg.sender?.department} • Fl ${msg.sender?.floor} • ${msg.sender?.office}`
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {/* Dynamic Typing Indicator bubble */}
            <AnimatePresence>
              {Object.keys(typingUsers).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="flex items-center gap-2 p-3 glass-panel rounded-2xl border border-zinc-800 text-xs text-indigo-400 max-w-[200px]"
                >
                  <div className="flex gap-1 items-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="truncate">{Object.values(typingUsers).join(", ")} is typing...</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 glass-panel border-t border-zinc-800 z-10 relative">
            {uploadingImage && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center gap-2 text-indigo-400 text-sm font-semibold z-20 backdrop-blur-xs">
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading attachment...
              </div>
            )}
            
            <form onSubmit={sendMessage} className="flex gap-2 items-center">
              {/* Media Sharing attachment button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 glass-input flex items-center justify-center text-zinc-400 hover:text-indigo-400 shrink-0 shadow-sm cursor-pointer"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden" 
              />

              <input
                type="text"
                value={newMessage}
                onChange={e => handleInputChange(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 glass-input text-sm text-zinc-100 placeholder:text-zinc-550 shadow-sm"
              />
              
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="w-11 h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 shadow-lg shadow-indigo-500/20"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-transparent relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center z-10"
          >
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800 shadow-xl">
              <MessageSquare className="w-10 h-10 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">Your Workspace</h3>
            <p className="text-sm text-zinc-500 max-w-xs">Select a chat from the sidebar or find someone in the Directory to start messaging.</p>
          </motion.div>
        </div>
      )}

      {/* Full-Screen Lightbox Modal for Shared Photos */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-100"
          >
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              src={selectedImage} 
              alt="Expanded photo attachment" 
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl border border-zinc-900"
              onClick={(e) => e.stopPropagation()} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {isCreateGroupOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col border border-zinc-800"
            >
              <div className="p-5 border-b border-zinc-800/50 flex justify-between items-center">
                <h2 className="font-semibold text-lg text-zinc-100">Create Custom Group</h2>
                <button onClick={() => setIsCreateGroupOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 border-b border-zinc-800/50">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Group Name</label>
                <input 
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. Project Alpha Team"
                  className="w-full px-4 py-3 glass-input text-sm text-zinc-100 placeholder:text-zinc-650 shadow-sm"
                />
              </div>

              <div className="p-5 border-b border-zinc-800/50 flex-1 min-h-0 flex flex-col">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Select Members</label>
                <input 
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search interns by name or department..."
                  className="w-full px-4 py-3 mb-4 glass-input text-sm text-zinc-100 placeholder:text-zinc-650 shadow-sm"
                />
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                  {allUsers
                    .filter(u => u.id !== session.user.id && (u.full_name.toLowerCase().includes(userSearch.toLowerCase()) || u.department.toLowerCase().includes(userSearch.toLowerCase())))
                    .map(user => {
                      const isSelected = selectedUsers.includes(user.id);
                      return (
                        <div 
                          key={user.id} 
                          onClick={() => setSelectedUsers(prev => isSelected ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-900/50 border-transparent hover:bg-zinc-800'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              {user.avatar_url ? (
                                <img 
                                  src={user.avatar_url} 
                                  alt={user.full_name} 
                                  className="w-10 h-10 rounded-full object-cover border border-zinc-800"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                                  {getInitials(user.full_name)}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-zinc-100">{user.full_name}</p>
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

              <div className="p-5 bg-zinc-900/50 rounded-b-2xl flex justify-end gap-3">
                <button onClick={() => setIsCreateGroupOpen(false)} className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                <button 
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedUsers.length === 0 || isCreatingGroup}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium rounded-xl hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                  {isCreatingGroup && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Group
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
