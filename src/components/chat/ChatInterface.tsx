"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Send, Hash, User as UserIcon, Loader2, MessageSquare,
  Plus, X, Check, Paperclip, Smile, Trash2, Maximize2,
  Bell, BellOff, FileText, Download, Phone, Search, Mic, StopCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ALL_INTERNS_CHAT_ID = "00000000-0000-0000-0000-000000000001";

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Release memory reference instantly
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
      canvas.toBlob((blob) => { resolve(blob || file); }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Safe fallback to raw file instead of throwing
    };
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
  const [messageSearch, setMessageSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const MESSAGES_PER_PAGE = 50;

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Desktop notifications setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  const triggerDesktopNotification = useCallback(async (msg: any) => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const { data: sender } = await supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', msg.sender_id)
        .single();

      const title = sender?.full_name || "New Message";
      const body = msg.file_name ? `📎 Shared a file: ${msg.file_name}` : msg.content || "📷 Shared a photo";
      const icon = sender?.avatar_url || "/favicon.ico";

      const notification = new Notification(title, {
        body,
        icon,
        tag: msg.chat_id,
        requireInteraction: false
      });

      notification.onclick = () => {
        window.focus();
        // Automatically switch to the sender's chat!
        const targetChat = chats.find(c => c.id === msg.chat_id);
        if (targetChat) setActiveChat(targetChat);
      };
    } catch (err) {
      console.error("Failed to trigger desktop notification:", err);
    }
  }, [chats]);

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
              triggerDesktopNotification(payload.new);
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

            // Send notification if tab is blurred/hidden
            if (payload.new.sender_id !== session.user.id && typeof document !== 'undefined' && document.hidden) {
              triggerDesktopNotification(payload.new);
            }
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
        // Bulk fetch all unread counts for this user using the new RPC function
        const { data: unreadData } = await supabase.rpc('get_all_unread_counts', { p_user_id: session.user.id });
        if (unreadData) {
          const countsMap: Record<string, number> = {};
          unreadData.forEach((row: any) => {
            countsMap[row.chat_id] = parseInt(row.unread_count, 10);
          });
          setUnreadCounts(prev => ({ ...prev, ...countsMap }));
        }

        const formatted = await Promise.all(chatsData.map(async (c: any) => {
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
            } else {
              c.name = "Deleted User";
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
    const { data } = await supabase.from('messages')
      .select('*, sender:users(id, full_name, avatar_url, office, department, floor), message_reactions(*)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PER_PAGE);

    if (data) { 
      setMessages(data.reverse() as any); 
      setHasMoreMessages(data.length === MESSAGES_PER_PAGE);
      scrollToBottom(true); 
    }

    if (activeChatRef.current && !activeChatRef.current.is_group && activeChatRef.current.other_user_id) {
      const { data: otherInfo } = await supabase.from('chat_members').select('last_read_at').eq('chat_id', chatId).eq('user_id', activeChatRef.current.other_user_id).maybeSingle();
      setOtherMemberLastRead(otherInfo?.last_read_at || null);
    } else {
      setOtherMemberLastRead(null);
    }
    setLoadingMessages(false);
  };

  const loadMoreMessages = async () => {
    if (!activeChat || loadingMore || !hasMoreMessages || messages.length === 0) return;
    setLoadingMore(true);
    const oldestMsg = messages[0];
    const { data } = await supabase.from('messages')
      .select('*, sender:users(id, full_name, avatar_url, office, department, floor), message_reactions(*)')
      .eq('chat_id', activeChat.id)
      .lt('created_at', oldestMsg.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PER_PAGE);
      
    if (data && data.length > 0) {
      setMessages(prev => [...(data.reverse() as any), ...prev]);
      setHasMoreMessages(data.length === MESSAGES_PER_PAGE);
    } else {
      setHasMoreMessages(false);
    }
    setLoadingMore(false);
  };

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMoreMessages) {
      loadMoreMessages();
    }
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
    if (error) {
      console.error("Send error:", error);
      setNewMessage(content);
    } else {
      sendPushNotification(content);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not available.");
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const file = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });
      
      setUploadingFile(true);
      try {
        const filePath = `${activeChat?.id}/${Date.now()}_voice_note.webm`;
        const { error: uploadError } = await supabase.storage.from('chat_media').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);

        const { error: msgError } = await supabase.from('messages').insert({
          chat_id: activeChat!.id,
          sender_id: session.user.id,
          content: '',
          image_url: publicUrl,
          file_name: 'voice_note.webm',
          file_type: 'audio/webm'
        });
        if (msgError) throw msgError;
        sendPushNotification('', false, "Voice Note");
      } catch (err: any) {
        alert("Failed to send voice note: " + err.message);
      } finally {
        setUploadingFile(false);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0 || !activeChat) return;
      const file = e.target.files[0];
      
      // Enforce 25MB file size limit
      if (file.size > 25 * 1024 * 1024) {
        alert("File size exceeds 25MB limit.");
        e.target.value = '';
        return;
      }
      
      setUploadingFile(true);
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
      sendPushNotification('', isImage, isImage ? null : file.name);
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

  // FCM HTTP v1 API via Serverless Endpoint
  const sendPushNotification = async (messageContent: string, isImage = false, fileName: string | null = null) => {
    if (!activeChat || !session?.user?.id) return;

    try {
      const senderName = session.user.user_metadata?.full_name || "Someone";

      // Construct message snippet
      let snippet = messageContent;
      if (isImage) snippet = "📷 Sent a photo";
      else if (fileName) snippet = `📎 Shared a file: ${fileName}`;

      // 1. Fetch target tokens
      let targetTokens: string[] = [];

      if (!activeChat.is_group) {
        // Direct Message: Fetch other member's token
        if (activeChat.other_user_id) {
          const { data: recipient } = await supabase
            .from('users')
            .select('fcm_token')
            .eq('id', activeChat.other_user_id)
            .maybeSingle();

          if (recipient?.fcm_token) {
            targetTokens.push(recipient.fcm_token);
          }
        }
      } else {
        // Group Chat: Fetch fcm_token of all other active members in the chat
        const { data: members } = await supabase
          .from('chat_members')
          .select('user_id, users!inner(fcm_token)')
          .eq('chat_id', activeChat.id)
          .neq('user_id', session.user.id);

        if (members && members.length > 0) {
          members.forEach((m: any) => {
            const token = m.users?.fcm_token;
            if (token) targetTokens.push(token);
          });
        }
      }

      if (targetTokens.length === 0) return;

      // 2. Call our secure serverless send-push API
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const token = currentSession?.access_token;
      
      const response = await fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          tokens: targetTokens,
          title: activeChat.is_group ? `${senderName} (#${activeChat.name})` : senderName,
          body: snippet,
          chatId: activeChat.id
        })
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        console.warn("FCM HTTP v1 background push warned:", resData.error || resData.message);
      } else {
        console.log(`Push notifications dispatched successfully via HTTP v1 serverless API.`);
      }
    } catch (err) {
      console.error("FCM background push fail:", err);
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
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2 rounded-xl transition-all ${isSearchOpen ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
            >
              <Search className="w-4 h-4" />
            </button>
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
          {isSearchOpen && (
            <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="w-full bg-zinc-800 text-sm text-white rounded-lg pl-9 pr-4 py-2 outline-none border border-zinc-700 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
          )}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain p-3 md:p-4 space-y-4 relative z-0"
            onScroll={handleMessagesScroll}
          >
            {/* Auto Delete Banner */}
            <div className="w-full flex justify-center mt-2 mb-6">
              <div className="bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 text-[10px] px-3 py-1.5 rounded-full flex items-center gap-2">
                <span>🛡️</span> Messages older than 7 days are automatically deleted.
              </div>
            </div>
            
            {/* Load More Spinner */}
            {loadingMore && (
              <div className="flex justify-center p-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-500" /></div>
            )}
            {loadingMessages ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.filter(m => m.content.toLowerCase().includes(messageSearch.toLowerCase()) || !messageSearch).map(msg => {
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
                                  <div className="mt-1 mb-1 rounded-xl overflow-hidden shadow-sm relative group/img cursor-zoom-in" onClick={() => setSelectedImage(msg.image_url!)}>
                                    <img src={msg.image_url!} alt="Attached media" className="max-w-full sm:max-w-[240px] md:max-w-[280px] max-h-[300px] object-contain bg-zinc-950/20" loading="lazy" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                      <Maximize2 className="w-5 h-5 text-white drop-shadow-md" />
                                    </div>
                                  </div>
                                )}
                                {/* Audio attachment */}
                                {msg.file_type?.startsWith('audio/') && (
                                  <div className="mt-1 mb-1 bg-zinc-800/50 rounded-xl p-2 flex flex-col gap-1 border border-zinc-700/50 min-w-[200px]">
                                    <span className="text-[10px] font-medium text-zinc-400 flex items-center gap-1"><Mic className="w-3 h-3"/> Voice Note</span>
                                    <audio controls src={msg.image_url!} className="w-full h-8 outline-none" />
                                  </div>
                                )}
                                {/* File attachment */}
                                {isFileMsgFile(msg) && !msg.file_type?.startsWith('audio/') && (
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
              
              {isRecording ? (
                <div className="flex-1 flex items-center justify-between px-4 py-2.5 glass-input text-rose-500 font-medium text-sm animate-pulse">
                  <span>Recording audio...</span>
                  <span>{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 glass-input text-sm text-[var(--text-primary)] placeholder:text-zinc-500"
                />
              )}

              {isRecording ? (
                <button type="button" onClick={stopRecording}
                  className="w-10 h-10 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 flex items-center justify-center text-rose-500 transition-all shrink-0"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : !newMessage.trim() ? (
                <button type="button" onClick={startRecording}
                  className="w-10 h-10 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 flex items-center justify-center text-indigo-400 transition-all shrink-0"
                >
                  <Mic className="w-5 h-5" />
                </button>
              ) : (
                <button type="submit" disabled={!newMessage.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 flex items-center justify-center text-white disabled:opacity-40 transition-all shrink-0 shadow-lg shadow-indigo-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
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
