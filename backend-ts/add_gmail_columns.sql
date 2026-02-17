-- ============================================================
-- Migration: Add Gmail OAuth columns to user_settings
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- ============================================================

-- Add Gmail OAuth token columns (safe to run multiple times)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_access_token TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_token_expiry TIMESTAMPTZ;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gmail_email TEXT;

-- Ensure email_method column exists (should already be there from SMTP setup)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_method TEXT;
