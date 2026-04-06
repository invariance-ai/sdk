export type BehavioralPrimitive =
  | 'decision_point'
  | 'orchestrator_decision'
  | 'tool_invocation'
  | 'sub_agent_spawn'
  | 'goal_drift'
  | 'constraint_check'
  | 'plan_revision'
  | 'a2a_send'
  | 'a2a_receive';

export interface NodeMetadata {
  depth: number;
  branch_factor: number;
  execution_ms: number;
  token_cost: number;
  tool_calls: string[];
  semantic_context?: string;
  tags: string[];
  context_inputs?: Array<{ kind: string; [key: string]: unknown }>;
  dependency_edges?: Array<{ relation: string; [key: string]: unknown }>;
  dependency_context?: Record<string, unknown>;
}

/** String-keyed routing values for monitor triggers (e.g. x-invariance-monitor-kind). */
export type TraceNodeCustomHeaders = Record<string, string>;

/** Typed monitor-facing attributes (e.g. risk_tier, detect_pii). */
export type TraceNodeCustomAttributes = Record<string, string | number | boolean | null>;

export interface TraceNode {
  id: string;
  session_id: string;
  parent_id: string | null;
  span_id: string;
  agent_id: string;
  action_type: BehavioralPrimitive;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
  metadata: NodeMetadata;
  custom_headers?: TraceNodeCustomHeaders;
  custom_attributes?: TraceNodeCustomAttributes;
  timestamp: number;
  duration_ms: number;
  hash: string;
  previous_hash: string;
  context_hash?: string;
  children_hashes: string[];
  signature: string | null;
  anomaly_score: number;
}

export interface TraceEventInput {
  session_id: string;
  agent_id: string;
  action_type: BehavioralPrimitive | string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  parent_id?: string;
  span_id?: string;
  duration_ms?: number;
  metadata?: Partial<NodeMetadata>;
  custom_headers?: TraceNodeCustomHeaders;
  custom_attributes?: TraceNodeCustomAttributes;
}

export interface ReplayTimelineEntry {
  node_id: string;
  action_type: string;
  timestamp: number;
  duration_ms: number;
  anomaly_score: number;
  input: unknown;
  output: unknown;
}

export interface ReplaySnapshot {
  snapshot: Record<string, unknown> | null;
}

export interface CausalChain {
  nodes: TraceNode[];
  anomaly_flags: Array<{ node_id: string; score: number; label: string }>;
  root_cause_node_id: string | null;
}

export interface CounterfactualRequest {
  branch_from_node_id: string;
  modified_input: unknown;
  modified_action_type?: string;
  tag?: string;
}

export interface CounterfactualResult {
  original_node_id: string;
  counterfactual_node_id: string;
  branch_session_id: string;
  replay_node_id: string;
  tag: string;
}

export interface AuditResult {
  audit_session_id: string;
  audit_agent_id: string;
  root_cause_node_id: string;
  findings: unknown;
}

export interface GraphPattern {
  pattern_id: string;
  action_type: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  outcome_distribution: Record<string, number>;
}

export interface PatternQuery {
  agentId?: string;
  actionType?: string;
  limit?: number;
  since?: number;
  until?: number;
}

export interface GraphSnapshot {
  nodes: unknown[];
  edges: unknown[];
}

export interface NodeDiff {
  diff: unknown;
}

export interface TraceChainVerifyResult {
  valid: boolean;
  brokenAt?: number;
  error?: string;
}

export interface TraceVerifyResult {
  verified: boolean;
  errors: string[];
}
