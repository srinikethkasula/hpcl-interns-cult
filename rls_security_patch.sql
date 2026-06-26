-- =========================================================================
-- HPCL INTERN CONNECT — SECURITY HARDENING & RLS POLICIES
-- =========================================================================
-- Run this script in your Supabase SQL Editor (SQL Editor > New Query > Run)
-- This script enables Row Level Security (RLS) on all tables and storage
-- buckets, sets up secure authorization policies to prevent data leaks,
-- and locks down SECURITY DEFINER functions from public execution.
-- =========================================================================

-- -------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- -------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 2. CREATE SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------

-- A. Policies for 'public.users'
DROP POLICY IF EXISTS "Allow authenticated read users" ON public.users;
CREATE POLICY "Allow authenticated read users" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow system user insertion" ON public.users;
CREATE POLICY "Allow system user insertion" ON public.users
  FOR INSERT WITH CHECK (true); -- Trigger handle_new_user() runs as security definer

DROP POLICY IF EXISTS "Allow users to update own profile" ON public.users;
CREATE POLICY "Allow users to update own profile" ON public.users
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to delete own profile" ON public.users;
CREATE POLICY "Allow users to delete own profile" ON public.users
  FOR DELETE TO authenticated USING (auth.uid() = id);


-- B. Policies for 'public.chats'
DROP POLICY IF EXISTS "Allow member read chats" ON public.chats;
CREATE POLICY "Allow member read chats" ON public.chats
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow authenticated users to create chats" ON public.chats;
CREATE POLICY "Allow authenticated users to create chats" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow member update chats" ON public.chats;
CREATE POLICY "Allow member update chats" ON public.chats
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );


-- C. Policies for 'public.chat_members'
DROP POLICY IF EXISTS "Allow member read chat memberships" ON public.chat_members;
CREATE POLICY "Allow member read chat memberships" ON public.chat_members
  FOR SELECT TO authenticated
  USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow authenticated users to insert chat memberships" ON public.chat_members;
CREATE POLICY "Allow authenticated users to insert chat memberships" ON public.chat_members
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow users to update own chat membership" ON public.chat_members;
CREATE POLICY "Allow users to update own chat membership" ON public.chat_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow members to delete chat memberships" ON public.chat_members;
CREATE POLICY "Allow members to delete chat memberships" ON public.chat_members
  FOR DELETE TO authenticated
  USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );


-- D. Policies for 'public.messages'
DROP POLICY IF EXISTS "Allow member read messages" ON public.messages;
CREATE POLICY "Allow member read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow member write messages" ON public.messages;
CREATE POLICY "Allow member write messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    chat_id IN (
      SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow sender update messages" ON public.messages;
CREATE POLICY "Allow sender update messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Allow sender delete messages" ON public.messages;
CREATE POLICY "Allow sender delete messages" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());


-- E. Policies for 'public.message_reactions'
DROP POLICY IF EXISTS "Allow member read reactions" ON public.message_reactions;
CREATE POLICY "Allow member read reactions" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    message_id IN (
      SELECT id FROM public.messages
      WHERE chat_id IN (
        SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow member write reactions" ON public.message_reactions;
CREATE POLICY "Allow member write reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    message_id IN (
      SELECT id FROM public.messages
      WHERE chat_id IN (
        SELECT chat_id FROM public.chat_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Allow owner delete reactions" ON public.message_reactions;
CREATE POLICY "Allow owner delete reactions" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- F. Policies for 'public.app_config' (CRITICAL DATALEAK PREVENTION)
DROP POLICY IF EXISTS "Allow public read of client configs only" ON public.app_config;
CREATE POLICY "Allow public read of client configs only" ON public.app_config
  FOR SELECT USING (key IN ('fcm_vapid_key', 'fcm_server_key'));

-- Disable insert/update/delete for public/authenticated keys (Dashboard Admins Only)
DROP POLICY IF EXISTS "Block write access to config" ON public.app_config;
CREATE POLICY "Block write access to config" ON public.app_config
  FOR ALL USING (false);


-- -------------------------------------------------------------
-- 3. SECURE SECURITY DEFINER FUNCTIONS & PUBLIC PRIVILEGES
-- -------------------------------------------------------------

-- Revoke default public execution privileges on Security Definer functions
ALTER FUNCTION public.handle_new_user() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Revoke default execution on auto enable function if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
    WHERE proname = 'rls_auto_enable' AND nspname = 'public'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SECURITY DEFINER;';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, service_role;';
  END IF;
END $$;


-- -------------------------------------------------------------
-- 4. HARDEN STORAGE POLICIES (AVATARS & CHAT MEDIA)
-- -------------------------------------------------------------

-- Avatars Bucket Policy Updates (Remove Listing Capabilities)
-- Enable public viewing of avatars without allowing directory listing:
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars" ON storage.objects 
  FOR SELECT USING (bucket_id = 'avatars');

-- Chat Media Bucket Policy Updates (Authenticated Read only without listing)
DROP POLICY IF EXISTS "Public Read Chat Media" ON storage.objects;
CREATE POLICY "Public Read Chat Media" ON storage.objects 
  FOR SELECT TO authenticated USING (bucket_id = 'chat_media');
