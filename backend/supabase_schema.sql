-- ============================================================
-- Founder Intelligence Platform — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  picture TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datasets (uploaded CSV/Excel data)
CREATE TABLE IF NOT EXISTS datasets (
  id BIGSERIAL PRIMARY KEY,
  dataset_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  columns JSONB DEFAULT '[]',
  numeric_columns JSONB DEFAULT '[]',
  period_column TEXT,
  row_count INTEGER DEFAULT 0,
  data JSONB DEFAULT '[]',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Computed Metrics
CREATE TABLE IF NOT EXISTS metrics (
  id BIGSERIAL PRIMARY KEY,
  metrics_id TEXT UNIQUE NOT NULL,
  dataset_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  growth_score FLOAT DEFAULT 0,
  efficiency_score FLOAT DEFAULT 0,
  pmf_signal FLOAT DEFAULT 0,
  scalability_index FLOAT DEFAULT 0,
  capital_efficiency FLOAT DEFAULT 0,
  metrics_detail JSONB DEFAULT '{}',
  trends JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Insights
CREATE TABLE IF NOT EXISTS insights (
  id BIGSERIAL PRIMARY KEY,
  insight_id TEXT UNIQUE NOT NULL,
  dataset_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  strategic_insights JSONB DEFAULT '[]',
  red_flags JSONB DEFAULT '[]',
  opportunities JSONB DEFAULT '[]',
  overall_assessment TEXT DEFAULT '',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narratives
CREATE TABLE IF NOT EXISTS narratives (
  id BIGSERIAL PRIMARY KEY,
  narrative_id TEXT UNIQUE NOT NULL,
  dataset_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  type TEXT DEFAULT '',
  key_highlights JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Founder Updates / Journal
CREATE TABLE IF NOT EXISTS updates (
  id BIGSERIAL PRIMARY KEY,
  update_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  images JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  contact_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  email TEXT NOT NULL,
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  tags JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  emails_sent INTEGER DEFAULT 0,
  last_contacted TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
  id BIGSERIAL PRIMARY KEY,
  log_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  subject TEXT DEFAULT '',
  recipients JSONB DEFAULT '[]',
  narrative_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_dataset ON metrics(dataset_id);
CREATE INDEX IF NOT EXISTS idx_metrics_user ON metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_dataset ON insights(dataset_id);
CREATE INDEX IF NOT EXISTS idx_narratives_user ON narratives(user_id);
CREATE INDEX IF NOT EXISTS idx_updates_user ON updates(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);

-- ============================================================
-- Disable RLS for backend-only access (dev mode)
-- ============================================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE datasets DISABLE ROW LEVEL SECURITY;
ALTER TABLE metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE narratives DISABLE ROW LEVEL SECURITY;
ALTER TABLE updates DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs DISABLE ROW LEVEL SECURITY;
