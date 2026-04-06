import type { TraceNode } from './trace.js';

export interface NLQueryResult {
  answer: string;
  sources?: unknown[];
}

export interface TraceQueryOpts {
  query?: string;
  session_id?: string;
  agent_id?: string;
  limit?: number;
  llm?: boolean;
}

export interface StructuredTraceQuery {
  action_type?: string;
  agent_id?: string;
  session_id?: string;
  from_timestamp?: number;
  to_timestamp?: number;
  min_anomaly_score?: number;
  has_error?: boolean;
  limit?: number;
}

export interface TraceQueryResult {
  data: TraceNode[];
  query: string;
  total: number;
}

export interface StatsResult {
  data: Array<{
    sessions: number;
    receipts: number;
    trace_nodes: number;
    avg_duration_ms: number;
    anomaly_rate: number;
  }>;
}

export interface StatsQuery {
  session_id?: string;
  agent_id?: string;
}

export interface AgentNote {
  id: string;
  key: string;
  owner_id: string;
  content: string;
  session_id: string | null;
  node_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface WriteNoteOpts {
  key: string;
  content: string;
  session_id?: string;
  node_id?: string;
  ttl_hours?: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface QueryScope {
  session_id?: string;
  agent_id?: string;
}
