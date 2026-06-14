export type ScopeAiSeverity = "low" | "medium" | "high";

export type ScopeAiHealth = "green" | "yellow" | "red";

export type ScopeAiBufferStatus = "ok" | "tight" | "critical" | "overfilled" | "unknown";

export interface ScopeAiBlocker {
  title: string;
  severity: ScopeAiSeverity;
  detail: string;
  issue_keys: string[];
}

export interface ScopeAiRecommendation {
  text: string;
  impact: ScopeAiSeverity;
}

export interface ScopeAiSummary {
  health: ScopeAiHealth;
  summary: string;
  whats_good?: string[];
  whats_bad?: string[];
  whats_critical?: string[];
  report_assessment?: string;
  open_questions_assessment?: string;
  role_workload_assessment?: string;
  role_risks?: string[];
  role_focus?: string[];
  capacity_assessment: string;
  buffer_status: ScopeAiBufferStatus;
  delivery_snapshot: string;
  blockers: ScopeAiBlocker[];
  scope_risks: string[];
  queue_insights: {
    todo: string;
    test: string;
  };
  recommendations: ScopeAiRecommendation[];
  focus_now: string[];
  watch_list: string[];
  generated_at: string;
  source: string;
}

export interface ScopeAiHistoryEntry {
  id: string;
  generated_at: string;
  snapshot_refreshed_at?: string | null;
  health: ScopeAiHealth;
  summary: string;
  analysis: ScopeAiSummary;
}
