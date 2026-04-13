export interface SessionInfo {
  id: string;
  name: string;
  agent: string;
  status: 'open' | 'closed' | 'tampered';
  receiptCount: number;
  rootHash: string | null;
  closeHash: string | null;
}

export interface RemoteSession {
  id: string;
  name: string;
  created_by: string;
  status: 'open' | 'closed' | 'tampered';
  created_at: string;
  closed_at: string | null;
  root_hash: string | null;
  close_hash: string | null;
  receipt_count?: number;
  runtime?: SessionRuntimeMetadata;
  tags?: string[];
}

export interface SessionRuntimeMetadata {
  framework?: string;
  version?: string;
  source?: 'external' | 'native' | string;
  sdk?: string;
  provider?: string;
  model?: string;
  external_agent_id?: string;
  agent_name?: string;
  [key: string]: unknown;
}

export interface SessionCreateOpts {
  id?: string;
  agent: string;
  name: string;
}

export interface SessionCreateBody {
  id: string;
  name: string;
  agent_id?: string;
  created_by?: string;
  runtime?: SessionRuntimeMetadata;
  tags?: string[];
}

export interface SessionCreateResult extends Partial<RemoteSession> {
  id: string;
  name: string;
  created_by: string;
  runtime?: SessionRuntimeMetadata;
  tags?: string[];
}

export interface SessionListOpts {
  status?: string;
  limit?: number;
  offset?: number;
  since?: number;
  until?: number;
}
