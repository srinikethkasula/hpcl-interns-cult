-- =========================================================================
-- HPCL Cult - Master Database Upgrade & Real-time Alignment Script
-- Run this COMPLETE script inside your Supabase SQL Editor.
-- =========================================================================

-- -------------------------------------------------------------
-- 1. UPGRADE COLUMNS & TABLE SCHEMAS (Robust Additions)
-- -------------------------------------------------------------

-- Add profile photo column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- Add attachment and soft delete columns to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Add tracking timestamp to chat memberships for unread counters
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone DEFAULT now();

-- Create table to handle emoji reactions (linked to messages and users)
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_message_user_emoji UNIQUE (message_id, user_id, emoji)
);


-- -------------------------------------------------------------
-- 2. DISABLE ROW LEVEL SECURITY (RLS) FOR CORE CHAT TABLES
-- This completely eliminates any security filter policies that block
-- users from seeing each other's messages, profiles, or reaction badges.
-- -------------------------------------------------------------

ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 3. SETUP PUBLIC STORAGE BUCKETS (Avatars & Chat Attachments)
-- -------------------------------------------------------------

-- Create storage bucket for Profile Pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for Shared Chat Media
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_media', 'chat_media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Security Policies for 'avatars' bucket
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars" ON storage.objects 
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects 
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
CREATE POLICY "Authenticated Update Avatars" ON storage.objects 
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;
CREATE POLICY "Authenticated Delete Avatars" ON storage.objects 
  FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- Storage Security Policies for 'chat_media' bucket
DROP POLICY IF EXISTS "Public Read Chat Media" ON storage.objects;
CREATE POLICY "Public Read Chat Media" ON storage.objects 
  FOR SELECT USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Upload Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Upload Chat Media" ON storage.objects 
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Update Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Update Chat Media" ON storage.objects 
  FOR UPDATE TO authenticated USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Delete Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Delete Chat Media" ON storage.objects 
  FOR DELETE TO authenticated USING (bucket_id = 'chat_media');


-- -------------------------------------------------------------
-- 4. REGISTER TABLES FOR REAL-TIME REPLICATION
-- Adds tables to the supabase_realtime publication to enable instant UI sync.
-- -------------------------------------------------------------

DO $$
BEGIN
  -- Add messages to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  -- Add message_reactions to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;
