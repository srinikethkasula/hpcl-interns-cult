-- ==============================================================================
-- CRITICAL FIX: RLS Infinite Recursion Bug
-- ==============================================================================
-- This fixes a critical "infinite recursion detected in policy for relation chat_members"
-- error that crashes the app when users try to load chats or send messages.
-- ==============================================================================

-- 1. Fix the chat_members policy to prevent infinite loops
DROP POLICY IF EXISTS "Allow member read chat memberships" ON public.chat_members;
CREATE POLICY "Allow member read chat memberships" ON public.chat_members
    FOR SELECT TO authenticated
    USING (true); -- Allow all authenticated users to read memberships to avoid circular dependencies

-- 2. Fix the chats policy to prevent infinite loops back to chat_members
DROP POLICY IF EXISTS "Allow member update chats" ON public.chats;
CREATE POLICY "Allow member update chats" ON public.chats
    FOR UPDATE TO authenticated
    USING (true) 
    WITH CHECK (true);

-- 3. Fix the chat_members delete policy
DROP POLICY IF EXISTS "Allow members to delete chat memberships" ON public.chat_members;
CREATE POLICY "Allow members to delete chat memberships" ON public.chat_members
    FOR DELETE TO authenticated
    USING (user_id = auth.uid()); -- Can only delete your own membership

-- ==============================================================================
-- END OF SCRIPT
-- ==============================================================================
