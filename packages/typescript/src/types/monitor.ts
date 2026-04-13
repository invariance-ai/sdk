// ── Canonical Monitor Contract Types ──
// Aligned with backend/src/monitors/types.ts in invariance-core.

// ── Severity ──

export type MonitorSeverity = 'low' | 'medium' | 'high' | 'critical';

// ── Family ──

export type MonitorFamily = 'rule' | 'code';

// ── Scope ──

export type MonitorScope = 'node' | 'session' | 'run' | 'agent' | 'batch';

// ── Legacy target / check type (backward compat) ──

export type MonitorTarget = 'trace_node' | 'session' | 'signal';
export type MonitorCheckType = 'cron' | 'node' | 'backend_rule';

// ── Target Matching ──

export interface MonitorTargetMatch {
  mode: 'direct' | 'contains';
  scope: MonitorScope;
  filters?: MonitorTargetFilter[];
  labels?: string[];
}

export interface MonitorTargetFilter {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'in' | 'exists';
  value?: unknown;
}

// ── Trigger ──

export type MonitorTriggerType =
  | 'event'
  | 'schedule'
  | 'manual'
  | 'field_condition'
  | 'anomaly'
  | 'dependency'
  | 'composite'
  | 'human_escalation'
  | 'rule';

export interface MonitorTriggerMatch {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'in' | 'exists';
  value?: unknown;
}

export type MonitorTrigger =
  | MonitorEventTrigger
  | MonitorScheduleTrigger
  | MonitorManualTrigger
  | MonitorFieldConditionTrigger
  | MonitorAnomalyTrigger
  | MonitorDependencyTrigger
  | MonitorCompositeTrigger
  | MonitorHumanEscalationTrigger
  | MonitorRuleTrigger;

export interface MonitorEventTrigger {
  type: 'event';
  source: 'trace_node' | 'signal' | 'session';
  event_types?: string[];
  match?: MonitorTriggerMatch;
}

export interface MonitorScheduleTrigger {
  type: 'schedule';
  cadence_minutes?: number;
  regions?: string[];
}

export interface MonitorManualTrigger {
  type: 'manual';
}

export interface MonitorFieldConditionTrigger {
  type: 'field_condition';
  field: string;
  operator: string;
  value: unknown;
}

export interface MonitorAnomalyTrigger {
  type: 'anomaly';
  metric: string;
  baseline_window_minutes: number;
  deviation_threshold: number;
}

export interface MonitorDependencyTrigger {
  type: 'dependency';
  upstream_monitor_ids: string[];
}

export interface MonitorCompositeTrigger {
  type: 'composite';
  monitor_ids: string[];
  window_minutes: number;
  require: 'all' | 'any';
}

export interface MonitorHumanEscalationTrigger {
  type: 'human_escalation';
  source_finding_status?: string;
}

export interface MonitorRuleTrigger {
  type: 'rule';
}

// ── Evaluator ──

export type MonitorEvaluatorType = 'threshold' | 'rule' | 'judge_llm' | 'judge_human' | 'code';

export type MonitorEvaluator =
  | MonitorThresholdEvaluator
  | MonitorRuleEvaluator
  | MonitorJudgeLLMEvaluator
  | MonitorJudgeHumanEvaluator
  | MonitorCodeEvaluator;

export interface MonitorThresholdEvaluator {
  type: 'threshold';
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
}

export interface MonitorRuleEvaluator {
  type: 'rule';
  match: 'all' | 'any';
  rules: MonitorDefinitionRule[];
  window?: { lookback_minutes: number };
}

export interface MonitorJudgeLLMEvaluator {
  type: 'judge_llm';
  model: string;
  rubric: string;
  output_schema?: Record<string, unknown>;
  max_tokens?: number;
}

export interface MonitorJudgeHumanEvaluator {
  type: 'judge_human';
  queue: string;
  instructions?: string;
  timeout_hours?: number;
  notify?: ('email' | 'slack' | 'dashboard')[];
}

export interface MonitorCodeEvaluator {
  type: 'code';
  runtime: 'hosted' | 'customer';
  entrypoint: string;
  inline_script?: string;
  filters?: {
    action_types?: string[];
    agent_ids?: string[];
  };
}

// ── Actions ──

export type MonitorActionType = 'create_finding' | 'emit_signal' | 'notify' | 'mark_object' | 'webhook';

export type MonitorAction =
  | MonitorCreateFindingAction
  | MonitorEmitSignalAction
  | MonitorNotifyAction
  | MonitorMarkObjectAction
  | MonitorWebhookAction;

export interface MonitorCreateFindingAction {
  type: 'create_finding';
  severity: MonitorSeverity;
  title: string;
  message: string;
}

export interface MonitorEmitSignalAction {
  type: 'emit_signal';
  severity: MonitorSeverity;
  title: string;
  message: string;
}

export interface MonitorNotifyAction {
  type: 'notify';
  channel: 'email' | 'slack' | 'webhook' | 'dashboard';
  target: string;
}

export interface MonitorMarkObjectAction {
  type: 'mark_object';
  label: string;
}

export interface MonitorWebhookAction {
  type: 'webhook';
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
}

// ── Rules ──

export type MonitorDefinitionRule =
  | { kind: 'field_match'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in'; value: unknown }
  | { kind: 'numeric_threshold'; field: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { kind: 'exists'; field: string; exists: boolean }
  | { kind: 'tag_match'; tag: string }
  | { kind: 'count_threshold'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown; count: { operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number; group_by?: string }
  | { kind: 'frequency'; field: string; operator: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown; rate: { per_minutes: number; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number }
  | { kind: 'repeated_occurrence'; field: string; min_count: number; window_minutes: number }
  | { kind: 'distinct_count'; field: string; count: { operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number }; window_minutes: number };

export const AGGREGATE_RULE_KINDS = new Set(['count_threshold', 'frequency', 'repeated_occurrence', 'distinct_count']);

// ── Backend Events ──

export type MonitorBackendEventName =
  | 'monitor.triggered'
  | 'monitor.passed'
  | 'monitor.failed'
  | 'monitor.skipped'
  | 'monitor.schema_mismatch'
  | 'monitor.escalated_to_human'
  | 'monitor.timed_out'
  | 'monitor.composite_pattern_detected'
  | 'monitor.anomaly_detected'
  | 'monitor.dependency_invalidated';

export interface MonitorBackendEvent {
  event: MonitorBackendEventName;
  session_id?: string;
  node_id?: string;
  run_id?: string;
  monitor_ref: string;
  monitor_version: number;
  timestamp: string;
  trigger_ref?: string;
  payload?: Record<string, unknown>;
}

// ── Execution & Finding Status ──

export type MonitorExecutionStatus = 'running' | 'passed' | 'failed' | 'error' | 'skipped' | 'timed_out';
export type MonitorFindingStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed' | 'review_requested';
export type MonitorReviewStatus = 'pending' | 'claimed' | 'passed' | 'failed' | 'needs_fix';
export type MonitorReviewDecision = 'pass' | 'fail' | 'needs_fix';

// ── Monitor Definition ──

export interface MonitorDefinitionBase {
  version: 1;

  // Canonical contract fields
  family?: MonitorFamily;
  scope?: MonitorScope;
  target_match?: MonitorTargetMatch;
  evaluator?: MonitorEvaluator;
  actions?: MonitorAction[];

  // Legacy fields (backward compat)
  type?: MonitorCheckType;
  trigger?: MonitorTrigger;
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

export interface CronMonitorDefinition extends MonitorDefinitionBase {
  type: 'cron';
  runtime: 'hosted';
  schedule: {
    cadence_minutes: number;
    regions?: string[];
  };
  job: {
    kind: 'http_request' | 'noop';
    request?: {
      url: string;
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      timeout_ms?: number;
    };
    expect?: {
      status_in?: number[];
      body_includes?: string[];
    };
  };
}

export interface NodeMonitorDefinition extends MonitorDefinitionBase {
  type: 'node';
  runtime: 'hosted' | 'customer';
  execution: {
    mode: 'trace_node' | 'ingester';
  };
  code: {
    entrypoint: string;
    inline_script?: string;
  };
  filters?: {
    action_types?: string[];
    agent_ids?: string[];
  };
}

export interface BackendRuleMonitorDefinition extends MonitorDefinitionBase {
  type: 'backend_rule';
  runtime: 'invariance';
  rule_source?: 'custom' | 'template';
}

export type MonitorDefinition =
  | MonitorDefinitionBase
  | CronMonitorDefinition
  | NodeMonitorDefinition
  | BackendRuleMonitorDefinition;

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
  definition?: MonitorDefinition | null;
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
  target: MonitorTarget;
  matches_found: number;
  matched_ids: string[];
  matched_node_ids: string[];
}

export interface MonitorListOpts {
  status?: string;
  agent_id?: string;
  target?: MonitorTarget;
  mode?: 'structured' | 'natural_language';
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

export interface MonitorExecution {
  id: string;
  monitor_id: string;
  monitor_version: number;
  owner_id: string;
  executor_type: string;
  trigger_type: string;
  trigger_source: string | null;
  status: string;
  input_ref: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

export interface MonitorExecutionListResponse {
  executions: MonitorExecution[];
  next_cursor: string | null;
}

export interface MonitorFinding {
  id: string;
  monitor_execution_id: string;
  monitor_id: string;
  owner_id: string;
  severity: string;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  status: string;
  dedupe_key: string | null;
  trace_node_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  created_at: string;
}

export interface MonitorFindingListResponse {
  findings: MonitorFinding[];
  next_cursor: string | null;
}

export interface MonitorHistoryListParams {
  after_id?: string;
  limit?: number;
}

// ── Reviews ──

export interface MonitorReview {
  id: string;
  finding_id: string;
  monitor_id: string;
  monitor_execution_id: string | null;
  owner_id: string;
  status: MonitorReviewStatus;
  priority: string;
  notes: string | null;
  assigned_to: string | null;
  reviewer_id: string | null;
  decision?: MonitorReviewDecision;
  resolved_at?: string;
  created_at: string;
}

export interface MonitorReviewCreateBody {
  finding_id: string;
  priority?: string;
  notes?: string;
}

export interface MonitorReviewUpdateBody {
  status?: 'claimed' | 'pending';
  assigned_to?: string | null;
  decision?: MonitorReviewDecision;
  notes?: string;
}

export interface MonitorReviewListResponse {
  reviews: MonitorReview[];
  next_cursor: string | null;
}

export interface MonitorReviewListParams {
  status?: MonitorReviewStatus;
  priority?: string;
  assigned_to?: string;
  monitor_id?: string;
  limit?: number;
  after_id?: string;
}

// ── Simple Monitor (customer-facing) ──

export type SimpleMonitorEvaluator =
  | { type: 'keyword'; field: string; value: string }
  | { type: 'threshold'; field: string; value: number; operator: 'gt' | 'gte' | 'lt' | 'lte' };

export interface SimpleMonitorBody {
  name: string;
  agent_id?: string;
  trigger?: { type: 'on_completion' | 'on_error' | 'scheduled'; cadence_minutes?: number };
  evaluator: SimpleMonitorEvaluator;
  severity?: MonitorSeverity;
  review?: boolean;
}
