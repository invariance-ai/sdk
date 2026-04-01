// ── Monitor Definition Types (mirrored from backend) ──

export type MonitorTarget = 'trace_node' | 'session' | 'signal';
export type MonitorSeverity = 'low' | 'medium' | 'high' | 'critical';

export type MonitorDefinitionRule =
  // Per-record rules
  | { kind: 'field_match'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in'; value: unknown }
  | { kind: 'numeric_threshold'; field: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { kind: 'exists'; field: string; exists: boolean }
  | { kind: 'tag_match'; tag: string }
  // Aggregate rules (evaluate over windows of records)
  | { kind: 'count_threshold'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown; count: { operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number; group_by?: string }
  | { kind: 'frequency'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown; rate: { per_minutes: number; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number }
  | { kind: 'repeated_occurrence'; field: string; min_count: number; window_minutes: number }
  | { kind: 'distinct_count'; field: string; count: { operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number };

export const AGGREGATE_RULE_KINDS = new Set(['count_threshold', 'frequency', 'repeated_occurrence', 'distinct_count']);

export interface MonitorDefinition {
  version: 1;
  target: MonitorTarget;
  match: 'all' | 'any';
  rules: MonitorDefinitionRule[];
  window?: { lookback_minutes: number };
  signal: {
    title: string;
    message: string;
    severity: MonitorSeverity;
  };
}

// ── Monitor API Types ──

export interface Monitor {
  id: string;
  name: string;
  natural_language: string;
  compiled_condition?: unknown;
  definition?: MonitorDefinition | null;
  agent_id: string | null;
  owner_id: string;
  status: 'active' | 'paused' | 'disabled';
  severity: MonitorSeverity;
  webhook_url: string | null;
  triggers_count: number;
  last_triggered?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMonitorBody {
  name: string;
  natural_language?: string;
  definition?: MonitorDefinition;
  agent_id?: string;
  severity?: MonitorSeverity;
  webhook_url?: string;
}

export interface UpdateMonitorBody {
  name?: string;
  natural_language?: string;
  definition?: MonitorDefinition;
  status?: 'active' | 'paused' | 'disabled';
  severity?: MonitorSeverity;
  webhook_url?: string;
  agent_id?: string;
}

export interface MonitorValidateResult {
  valid: boolean;
  errors?: string[];
}

export interface MonitorEvaluateResult {
  monitor_id: string;
  matches_found: number;
  matched_node_ids: string[];
}

/** @deprecated Use `Signal` from `./signal.js` instead. */
export interface MonitorSignal {
  id: string;
  monitor_id: string;
  monitor_name: string;
  node_id: string;
  session_id: string;
  agent_id: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

/** @deprecated Use `SignalQuery` from `./signal.js` instead. */
export interface MonitorEventsQuery {
  monitor_id?: string;
  after_id?: string;
  limit?: number;
  acknowledged?: boolean;
}

export interface MonitorCompilePreview {
  compiled: unknown;
}
