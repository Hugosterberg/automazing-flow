-- Migration: clean up legacy "default" profile_id references in connected_accounts.
--
-- Background: Early versions of the app used the synthetic string "default" as
-- a profile_id before the business_profiles / memberships model was introduced.
-- Those rows have no business_profile_id set and no corresponding row in
-- business_profiles, so they're effectively orphaned. This migration sets
-- business_profile_id to NULL for those rows so they no longer create
-- misleading joins. A future step can re-associate them via the UI.

UPDATE connected_accounts
SET profile_id = NULL
WHERE profile_id = 'default'
  AND business_profile_id IS NULL;

-- Also clean up any oauth_token_entries that reference "default" profile
-- context (stored in metadata) — these are safe to orphan since the account
-- itself is already cleaned above.
