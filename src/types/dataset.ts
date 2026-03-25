export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  owner_id: string;
  current_draft_version: number;
  latest_published_version: number;
  row_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DatasetRow {
  id: string;
  dataset_id: string;
  input: unknown;
  expected: unknown;
  metadata: Record<string, unknown>;
  tags: string[];
  source_trace_node_id: string | null;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: number;
  notes: string | null;
  created_by: string;
  row_count: number;
  snapshot: unknown;
  created_at: string;
}

export interface CreateDatasetBody {
  name: string;
  description?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDatasetBody {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateDatasetRowBody {
  input: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
  source_trace_node_id?: string;
  source_session_id?: string;
}

export interface UpdateDatasetRowBody {
  input?: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface DatasetFromTracesBody {
  session_ids: string[];
  agent_id: string;
  name: string;
  description?: string;
  filter?: {
    action_types?: string[];
    min_anomaly_score?: number;
  };
}

export interface ImportDatasetRowsFromTracesBody {
  session_ids: string[];
  agent_id: string;
  filter?: {
    action_types?: string[];
    min_anomaly_score?: number;
  };
}
