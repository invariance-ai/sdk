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
}

export interface SessionCreateOpts {
  id?: string;
  agent: string;
  name: string;
}

export interface SessionListOpts {
  status?: string;
  limit?: number;
  offset?: number;
  since?: number;
  until?: number;
}
