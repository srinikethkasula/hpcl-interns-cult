-- =========================================================================
-- HPCL Cult - Clean up duplicate DM chats
-- Run this in your Supabase SQL Editor to remove duplicate DMs
-- =========================================================================

-- Find and delete duplicate DM chats, keeping only the oldest one per pair
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

-- Verify: should now show max 1 DM per user pair
SELECT 
  LEAST(cm1.user_id, cm2.user_id) AS user_a,
  GREATEST(cm1.user_id, cm2.user_id) AS user_b,
  COUNT(*) AS dm_count
FROM chats c
JOIN chat_members cm1 ON cm1.chat_id = c.id
JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != cm1.user_id
WHERE c.is_group = false
GROUP BY 1, 2
ORDER BY dm_count DESC;
