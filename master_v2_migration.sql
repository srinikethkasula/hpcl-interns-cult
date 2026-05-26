-- =========================================================================
-- HPCL INTERN CONNECT — MASTER V2 DATABASE MIGRATION SCRIPT
-- =========================================================================
-- Consolidates all previous migrations, bug fixes, triggers, schemas, 
-- cleanups, storage buckets, RLS disablers, and the 7-day pg_cron worker.
-- Run this ENTIRE script in your Supabase SQL Editor (SQL Editor > New Query).
-- =========================================================================

-- -------------------------------------------------------------
-- 1. BASE SCHEMAS & COLUMN UPGRADES (Robust Additions)
-- -------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN office DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN department DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN floor DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN avatar_url DROP NOT NULL;

-- Messages table attachments & v2 file sharing fields
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Chat members v2 tracking & mute controls
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone DEFAULT now();
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;

-- Create message reactions table if not exists
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_message_user_emoji UNIQUE (message_id, user_id, emoji)
);


-- -------------------------------------------------------------
-- 2. DISABLE ROW LEVEL SECURITY (RLS) FOR REALTIME ALIGNMENT
-- -------------------------------------------------------------
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 3. SETUP PUBLIC STORAGE BUCKETS & AUTH POLICIES
-- -------------------------------------------------------------
-- Profile Avatars Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Chat Media & Shared Files Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_media', 'chat_media', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars Bucket security policies
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
CREATE POLICY "Authenticated Update Avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;
CREATE POLICY "Authenticated Delete Avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- Chat Media Bucket security policies
DROP POLICY IF EXISTS "Public Read Chat Media" ON storage.objects;
CREATE POLICY "Public Read Chat Media" ON storage.objects FOR SELECT USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Upload Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Upload Chat Media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Update Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Update Chat Media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Delete Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Delete Chat Media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat_media');


-- -------------------------------------------------------------
-- 4. CLEAN UP DUPLICATE DM CHATS (Keeping oldest per pair)
-- -------------------------------------------------------------
WITH ranked_dms AS (
  SELECT
    c.id AS chat_id,
    LEAST(cm1.user_id, cm2.user_id) AS user_a,
    GREATEST(cm1.user_id, cm2.user_id) AS user_b,
    c.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(cm1.user_id, cm2.user_id), GREATEST(cm1.user_id, cm2.user_id)
      ORDER BY c.created_at ASC
    ) AS rn
  FROM chats c
  JOIN chat_members cm1 ON cm1.chat_id = c.id
  JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != cm1.user_id
  WHERE c.is_group = false
)
DELETE FROM chats
WHERE id IN (
  SELECT chat_id FROM ranked_dms WHERE rn > 1
);


-- -------------------------------------------------------------
-- 5. INITIALIZE THE ALL INTERNS MASTER CHAT (Pinned)
-- -------------------------------------------------------------
INSERT INTO chats (id, is_group, name)
VALUES ('00000000-0000-0000-0000-000000000001', true, 'All Interns 🏢')
ON CONFLICT (id) DO NOTHING;

-- Bulk add all existing registered users to the All Interns master chat
INSERT INTO chat_members (chat_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM users
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------------
-- 6. SETUP THE ROBUST AUTO-REGISTRATION USER SIGNUP TRIGGER
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Insert/Sync user profile from Auth Metadata securely
  INSERT INTO public.users (id, phone, full_name, office, department, floor, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'office', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    COALESCE(NEW.raw_user_meta_data->>'floor', ''),
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    phone       = COALESCE(EXCLUDED.phone, public.users.phone),
    full_name   = COALESCE(EXCLUDED.full_name, public.users.full_name),
    office      = COALESCE(EXCLUDED.office, public.users.office),
    department  = COALESCE(EXCLUDED.department, public.users.department),
    floor       = COALESCE(EXCLUDED.floor, public.users.floor);

  -- 2. Bulletproof check: Ensure All Interns chat exists (avoids FK violation on fresh DB)
  INSERT INTO public.chats (id, is_group, name)
  VALUES ('00000000-0000-0000-0000-000000000001', true, 'All Interns 🏢')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Auto-add the newly signed up user to the All Interns master chat
  INSERT INTO public.chat_members (chat_id, user_id)
  VALUES ('00000000-0000-0000-0000-000000000001', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach the upgraded trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------
-- 7. REGISTER TABLES FOR REAL-TIME SYNC
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

  -- Add chat_members to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
  END IF;
END $$;


-- -------------------------------------------------------------
-- 8. SCHEDULER: 7-DAY MESSAGE CLEANUP CRON WORKER
-- -------------------------------------------------------------
-- Enable pg_cron (standard on all modern Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily hard delete cron at 2:00 AM UTC
SELECT cron.schedule(
  'delete-old-messages',
  '0 2 * * *',
  $$
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

-- Output setup success verification indicators
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'delete-old-messages';
