# Advanced Traction Intelligence AI - Local Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** and npm - [Download Node.js](https://nodejs.org/)
- **Supabase project** - [Create free project](https://supabase.com/)

## Quick Start

### 1. Backend Setup (Node.js/TypeScript)

#### Step 1.1: Navigate to backend directory

```bash
cd backend-ts
```

#### Step 1.2: Install dependencies

```bash
npm install
```

#### Step 1.3: Configure environment variables

Create `backend-ts/.env` file with the following:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# AI (Google Gemini)
GEMINI_API_KEY=your_gemini_api_key_here

# Email (Optional)
RESEND_API_KEY=your_resend_api_key_here
SENDER_EMAIL=onboarding@resend.dev

# Server
PORT=8000
```

> **Note**: For initial testing, you can use placeholder values for API keys, but AI features won't work without a valid `GEMINI_API_KEY`.

#### Step 1.4: Start the backend server

```bash
npm run dev
```

The backend should now be running at `http://localhost:8000`

### 2. Frontend Setup (React/TypeScript)

#### Step 2.1: Open a new terminal and navigate to frontend directory

```bash
cd frontend
```

#### Step 2.2: Install dependencies

```bash
npm install
```

#### Step 2.3: Configure environment variables

Create `frontend/.env` file with:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

#### Step 2.4: Start the development server

```bash
npm start
```

The frontend should automatically open in your browser at `http://localhost:3000`

## Convenience Scripts (Windows)

Double-click to start each service:

- **start_backend.bat** — runs the Node.js/TypeScript backend with hot-reload
- **start_frontend.bat** — runs the React dev server

## Verification

1. **Backend Health Check**: Visit `http://localhost:8000/api/health` — should return `{"status":"ok"}`
2. **Frontend**: Visit `http://localhost:3000` — should show the landing page with login form

## Project Structure

```
Advanced-Traction-Intelligence-AI/
├── backend-ts/
│   ├── src/
│   │   ├── index.ts           # Express server entry point
│   │   ├── config.ts          # Environment variables
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── supabase.ts        # Supabase client
│   │   ├── llm.ts             # Google Gemini AI wrapper
│   │   ├── middleware.ts      # Auth middleware
│   │   ├── metrics.ts         # Growth metrics engine
│   │   └── routes/
│   │       ├── auth.ts        # Email/password authentication
│   │       ├── data.ts        # Data upload & datasets
│   │       ├── insights.ts    # AI insights & narratives
│   │       ├── updates.ts     # Startup updates
│   │       ├── contacts.ts    # Contact management
│   │       └── email.ts       # Email sending
│   ├── package.json           # Node dependencies
│   ├── tsconfig.json          # TypeScript config
│   └── .env                   # Backend environment variables
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main React component
│   │   ├── api.ts             # API client
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── context/           # Auth context
│   │   ├── components/        # Reusable components
│   │   └── pages/             # Page components
│   ├── package.json           # Node dependencies
│   └── .env                   # Frontend environment variables
└── SETUP_GUIDE.md             # This file
```

## Required API Keys

### SUPABASE_URL & SUPABASE_KEY

- Used for database (PostgreSQL) and storage
- Get from: [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API

### GEMINI_API_KEY

- Used for AI-powered insights and narrative generation
- Get from: [Google AI Studio](https://aistudio.google.com/apikey)

### RESEND_API_KEY (Optional)

- Used for email functionality
- Get from: [Resend](https://resend.com)
- Can skip for basic testing

## Supabase Database Setup

Run this SQL in your Supabase SQL Editor to create the required tables:

```sql
-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  picture TEXT DEFAULT '',
  password_hash TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Datasets
CREATE TABLE IF NOT EXISTS datasets (
  dataset_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  filename TEXT,
  columns TEXT[],
  numeric_columns TEXT[],
  period_column TEXT,
  row_count INT,
  data JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Metrics
CREATE TABLE IF NOT EXISTS metrics (
  metrics_id TEXT PRIMARY KEY,
  dataset_id TEXT REFERENCES datasets(dataset_id),
  user_id TEXT REFERENCES users(user_id),
  growth_score NUMERIC,
  efficiency_score NUMERIC,
  pmf_signal NUMERIC,
  scalability_index NUMERIC,
  capital_efficiency NUMERIC,
  metrics_detail JSONB,
  trends JSONB,
  computed_at TIMESTAMPTZ DEFAULT now()
);

-- Insights
CREATE TABLE IF NOT EXISTS insights (
  insight_id TEXT PRIMARY KEY,
  dataset_id TEXT REFERENCES datasets(dataset_id),
  user_id TEXT REFERENCES users(user_id),
  insights JSONB,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Narratives
CREATE TABLE IF NOT EXISTS narratives (
  narrative_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  narrative_type TEXT,
  content TEXT,
  dataset_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Updates
CREATE TABLE IF NOT EXISTS updates (
  update_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  title TEXT,
  content TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[],
  images JSONB,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  contact_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  name TEXT,
  email TEXT,
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  tags TEXT[],
  notes TEXT DEFAULT '',
  emails_sent INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
  log_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  to_email TEXT,
  subject TEXT,
  status TEXT,
  provider_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);
```

## Troubleshooting

### Backend Issues

**"Cannot find module" errors**

- Run `npm install` in `backend-ts/`
- Ensure you're using Node.js 18+

**"Connection refused" / Supabase errors**

- Verify `SUPABASE_URL` and `SUPABASE_KEY` in `backend-ts/.env`
- Ensure tables are created (run the SQL above)

**Port 8000 already in use**

- Kill existing process or change `PORT` in `.env`

### Frontend Issues

**"npm ERR! code ENOENT"**

- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

**"Proxy error" / API not connecting**

- Verify backend is running on port 8000
- Check `REACT_APP_BACKEND_URL` in frontend `.env`

## Notes

- The entire stack is **TypeScript** — both frontend and backend
- Database is **Supabase (PostgreSQL)** — no MongoDB, no local DB setup needed
- Authentication is **email/password** with bcrypt hashing and session cookies
- AI uses **Google Gemini 2.0 Flash**

## Next Steps

1. Create an account on the landing page
2. Upload sample CSV/Excel data via the Data Upload page
3. Compute metrics to see strategic scores
4. Generate AI insights (requires valid `GEMINI_API_KEY`)
5. Create investor narratives
6. Manage contacts and updates
