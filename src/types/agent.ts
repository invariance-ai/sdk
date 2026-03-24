export interface AgentRecord {
  id: string;
  name: string;
  api_key: string;
  public_key: string;
  created_at: string;
}

export interface AgentMetrics {
  agent_id: string;
  name: string;
  run_count: number;
  executions: number;
  tool_calls: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  anomaly_rate: number;
  error_rate: number;
  last_active: string;
  avg_anomaly: number;
}

export interface AgentActionTemplate {
  action: string;
  label: string;
  category?: string;
  icon?: string;
  highlights?: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  description?: string;
}

export interface AgentActionPolicy {
  id?: string;
  agent_id?: string;
  action: string;
  effect: 'allow' | 'deny';
}
