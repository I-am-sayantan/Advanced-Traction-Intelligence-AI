import { Request } from "express";

// ─── User & Auth ────────────────────────────────────────────────

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  created_at: string;
}

export interface UserSession {
  user_id: string;
  session_token: string;
  expires_at: string;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// ─── Datasets ───────────────────────────────────────────────────

export interface Dataset {
  dataset_id: string;
  user_id: string;
  filename: string;
  columns: string[];
  numeric_columns: string[];
  period_column: string | null;
  row_count: number;
  data: Record<string, unknown>[];
  uploaded_at: string;
}

// ─── Metrics ────────────────────────────────────────────────────

export interface ColumnMetrics {
  mean: number;
  latest: number;
  min: number;
  max: number;
  total: number;
  avg_growth_rate?: number;
  growth_rates?: number[];
}

export interface MetricsResult {
  growth_score: number;
  efficiency_score: number;
  pmf_signal: number;
  scalability_index: number;
  capital_efficiency: number;
  metrics_detail: Record<string, ColumnMetrics>;
  trends: Record<string, number[]>;
}

export interface MetricsDoc extends MetricsResult {
  metrics_id: string;
  dataset_id: string;
  user_id: string;
  computed_at: string;
}

// ─── Insights ───────────────────────────────────────────────────

export interface StrategicInsight {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  category: "growth" | "efficiency" | "retention" | "revenue";
}

export interface RedFlag {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export interface Opportunity {
  title: string;
  description: string;
  potential_impact: string;
  priority: "high" | "medium" | "low";
}

export interface InsightsData {
  strategic_insights: StrategicInsight[];
  red_flags: RedFlag[];
  opportunities: Opportunity[];
  overall_assessment: string;
}

export interface InsightDoc extends InsightsData {
  insight_id: string;
  dataset_id: string;
  user_id: string;
  generated_at: string;
}

// ─── Narratives ─────────────────────────────────────────────────

export interface NarrativeRequest {
  dataset_id: string;
  narrative_type:
    | "traction_statement"
    | "vc_email"
    | "executive_summary"
    | "monthly_update";
  custom_context?: string;
}

export interface NarrativeDoc {
  narrative_id: string;
  dataset_id: string;
  user_id: string;
  title: string;
  content: string;
  type: string;
  key_highlights: string[];
  generated_at: string;
}

// ─── Updates ────────────────────────────────────────────────────

export interface UpdateImage {
  data: string;
  type: string;
  name: string;
}

export interface UpdateDoc {
  update_id: string;
  user_id: string;
  content: string;
  images: UpdateImage[];
  tags: string[];
  created_at: string;
}

export interface UpdateAnalysis {
  summary: string;
  key_themes: string[];
  momentum_signal: "positive" | "neutral" | "negative";
  suggested_metrics_to_track: string[];
  recommended_update_for_investors: string;
  action_items: string[];
  trend_observations: {
    observation: string;
    implication: string;
    priority: string;
  }[];
}

// ─── Contacts ───────────────────────────────────────────────────

export interface Contact {
  contact_id: string;
  user_id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  tags: string[];
  notes: string;
  emails_sent: number;
  last_contacted: string | null;
  created_at: string;
}

export interface ContactCreateBody {
  name: string;
  email: string;
  company?: string;
  role?: string;
  tags?: string[];
  notes?: string;
}

export interface ContactUpdateBody {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  tags?: string[];
  notes?: string;
}

// ─── Email ──────────────────────────────────────────────────────

export interface EmailSendBody {
  contact_ids: string[];
  subject: string;
  html_content: string;
  narrative_id?: string;
}

export interface EmailResult {
  contact_id: string;
  email: string;
  status: "sent" | "failed";
  email_id?: string;
  error?: string;
}
