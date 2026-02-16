# Founder Intelligence Platform - PRD

## Problem Statement
Build an AI-native Traction Intelligence & Investor Communication Platform that ingests messy startup data, derives strategic metrics automatically, detects growth signals, generates funding-ready narratives, and becomes a founder's reporting brain.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React + Tailwind CSS on port 3000
- **Database**: MongoDB (founder_intelligence)
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key
- **Auth**: Emergent-managed Google OAuth

## User Personas
1. **Pre-seed to Series B Founders** - Need investor-grade reporting without the hassle
2. **SaaS/Marketplace Companies** - Track growth metrics and generate VC communications
3. **Venture-backed Founders** - Monthly update automation

## Core Requirements (Static)
1. Data Ingestion Engine (CSV/Excel upload, normalize, parse)
2. Strategic Metrics Engine (5 proprietary composite scores)
3. AI Signal Interpretation (GPT-5.2 powered insights)
4. Funding Narrative Generator (4 narrative types)
5. Dashboard with bento grid layout
6. Google OAuth authentication

## What's Been Implemented (Feb 16, 2026)
### MVP - Narrative MVP Scope
- [x] Landing page with Google OAuth login
- [x] Auth callback with session management (httpOnly cookies)
- [x] Dashboard with stats row, composite score ring charts, trend charts, signal feed
- [x] Data Upload page with drag & drop (CSV/Excel)
- [x] Strategic Metrics Engine: Growth Score, Efficiency Score, PMF Signal, Scalability Index, Capital Efficiency
- [x] AI Signal Interpretation: strategic insights, red flags, hidden opportunities
- [x] Narrative Generator: Traction Statement, VC Email, Executive Summary, Monthly Update
- [x] Sidebar navigation across all pages
- [x] Full API suite: auth, upload, metrics, insights, narratives, dashboard

### Composite Scores (Proprietary IP)
1. **Growth Score** (0-100): Revenue/user growth rates
2. **Efficiency Score** (0-100): Revenue vs cost ratios
3. **PMF Signal** (0-100): Churn-adjusted retention signal
4. **Scalability Index** (0-100): Revenue growth vs cost growth delta
5. **Capital Efficiency** (0-100): Revenue/cost per latest period

## Prioritized Backlog

### P0 - Next Priority
- Monthly Update Flow (automated monthly comparison)
- Historical data comparison (month-over-month delta visualization)
- Dataset management (edit, delete from UI)

### P1 - Near Term
- Presentation Builder (auto-generate slides/PDF)
- Contact Manager (VC list, tagging, segmentation)
- Email sending integration
- Multi-dataset comparison

### P2 - Future
- Google Sheets integration
- Stripe/HubSpot direct data ingestion
- Predictive intelligence layer (Series A readiness)
- Industry benchmarking
- Investor engagement analytics
- Subscription/billing (Stripe)
- Portfolio plan (multi-company dashboard)

## Next Tasks
1. Add month-over-month comparison visualization
2. Add dataset management (edit/delete from UI)
3. Build presentation/PDF export
4. Add email sending capability (SendGrid/Resend)
