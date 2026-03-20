// ── Query ──
export interface NLQueryRequest {
  question: string;
  conversation_id?: string;
  context?: NLQueryContext;
}

export interface NLQueryContext {
  agent_id?: string;
  session_id?: string;
  time_range?: { since?: number; until?: number };
}

export interface NLQueryResponse {
  answer: string;
  conversation_id: string;
  data_sources: NLQueryDataSource[];
  structured_results?: NLStructuredResult[];
  trace_context?: NLTraceContext;
  confidence: number;
}

export interface NLQueryDataSource {
  type: 'sessions' | 'agents' | 'trace_nodes' | 'anomalies' | 'receipts' |
        'contracts' | 'graph_edges' | 'monitor_events' | 'patterns';
  count: number;
  query_description: string;
}

export interface NLStructuredResult {
  type: 'table' | 'card' | 'timeline' | 'metric';
  title: string;
  data: unknown;
}

// ── Trace Context ──
export interface NLTraceContext {
  session_id: string;
  nodes: NLTraceNode[];
  highlighted_node_ids: string[];
  causal_chain?: {
    nodes: NLTraceNode[];
    anomaly_flags: Array<{ node_id: string; score: number; label: string }>;
    root_cause_node_id: string;
  };
}

// Full TraceNode shape matching backend types.ts lines 54-74 + NodeMetadata 41-52
export interface NLTraceNode {
  id: string;
  session_id: string;
  parent_id: string | null;
  span_id: string;
  agent_id: string;
  action_type: string;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
  metadata: {
    depth: number;
    branch_factor: number;
    execution_ms: number;
    token_cost: number;
    tool_calls: string[];
    semantic_context: string;
    tags: string[];
  };
  timestamp: number;
  duration_ms: number;
  hash: string;
  previous_hash: string;
  context_hash?: string;
  previous_context_hash?: string;
  children_hashes: string[];
  signature: string | null;
  anomaly_score: number;
}

// ── SSE Envelope ──
export interface LiveStatusEvent {
  id: string;
  type: 'session_created' | 'session_closed' | 'receipt_submitted' |
        'anomaly_detected' | 'monitor_triggered' | 'trace_node_created';
  timestamp: number;
  session_id?: string;
  agent_id?: string;
  payload: Record<string, unknown>;
}
