// ─── API Response Types ─────────────────────────────────────────

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  created_at?: string;
}

export interface Dataset {
  dataset_id: string;
  user_id: string;
  filename: string;
  columns: string[];
  numeric_columns: string[];
  period_column?: string;
  row_count: number;
  uploaded_at: string;
}

export interface UploadResult {
  dataset_id: string;
  filename: string;
  row_count: number;
  columns: string[];
  numeric_columns: string[];
  period_column?: string;
}

export interface Metrics {
  metrics_id: string;
  dataset_id: string;
  growth_score: number;
  efficiency_score: number;
  pmf_signal: number;
  scalability_index: number;
  capital_efficiency: number;
  metrics_detail: Record<string, unknown>;
  trends: Record<string, number[]>;
  computed_at: string;
}

export interface StrategicInsight {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface RedFlag {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export interface Opportunity {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  potential_impact?: string;
}

export interface Insights {
  insight_id: string;
  dataset_id: string;
  overall_assessment?: string;
  strategic_insights?: StrategicInsight[];
  red_flags?: RedFlag[];
  opportunities?: Opportunity[];
}

export interface DashboardOverview {
  total_datasets: number;
  total_narratives: number;
  datasets: Dataset[];
  latest_metrics: Metrics | null;
  latest_insights: Insights | null;
}

export interface Narrative {
  narrative_id: string;
  dataset_id: string;
  title: string;
  type: string;
  content: string;
  key_highlights?: string[];
  created_at: string;
}

export interface TrendObservation {
  observation: string;
  implication: string;
}

export interface UpdateAnalysis {
  summary: string;
  momentum_signal: "positive" | "neutral" | "negative";
  key_themes: string[];
  recommended_update_for_investors: string;
  trend_observations: TrendObservation[];
  action_items: string[];
}

export interface UpdateItem {
  update_id: string;
  user_id: string;
  content: string;
  tags?: string[];
  images?: { type: string; data: string }[];
  created_at: string;
}

export interface Contact {
  contact_id: string;
  user_id: string;
  name: string;
  email: string;
  company?: string;
  role?: string;
  tags?: string[];
  notes?: string;
  emails_sent?: number;
  created_at: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface EmailSendResult {
  sent: number;
  failed: number;
}

export interface ScoreItem {
  label: string;
  value: number;
  color: string;
}

export interface Signal {
  type: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
  title: string;
  desc: string;
}

export interface NarrativeType {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  desc: string;
}

export interface ImagePreview {
  file: File;
  preview: string;
  name: string;
}
