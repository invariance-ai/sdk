export interface SearchResult {
  type: 'session' | 'agent' | 'anomaly';
  id: string;
  label: string;
  subtitle?: string;
}

export interface UsageEvent {
  id: string;
  developer_id: string | null;
  org_id: string | null;
  event_type: 'receipt' | 'trace_node' | 'contract' | 'api_call';
  agent_identity: string | null;
  quantity: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageQuery {
  event_type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  created_at: string;
  revoked_at: string | null;
}

export interface CreateApiKeyBody {
  name?: string;
  scopes?: string[];
}

export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  monitors: unknown[];
}

export interface TemplateApplyResult {
  pack_id: string;
  monitors_created: number;
  monitors: unknown[];
}

export interface VerifyResult {
  valid: boolean;
  receipt_count: number;
  errors: string[];
}

export interface HealthResponse {
  ok: boolean;
  version: string;
}

export interface LiveStatusEvent {
  type: 'trace_node_created' | 'anomaly_detected' | 'session_created' | 'session_closed' | 'ping';
  data: unknown;
}
