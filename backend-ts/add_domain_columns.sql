-- Add domain tracking columns to user_settings
-- Run this in Supabase SQL editor

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS resend_domain_id TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS resend_domain_name TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS resend_domain_status TEXT DEFAULT 'not_started';
-- Status values: not_started, pending, verified, failed
