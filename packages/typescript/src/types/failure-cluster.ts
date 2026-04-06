export interface FailureCluster {
  id: string;
  agent_id: string;
  cluster_type: string;
  label: string;
  description: string | null;
  severity: string;
  occurrence_count: number;
  status: string;
  resolution_notes: string | null;
  first_seen: string | null;
  last_seen: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
  members?: FailureClusterMember[];
}

export interface FailureClusterMember {
  id: string;
  cluster_id: string;
  trace_node_id: string;
  session_id: string;
  added_at: string;
}

export interface CreateFailureClusterBody {
  agent_id: string;
  cluster_type: string;
  label: string;
  description?: string;
  severity?: string;
}

export interface UpdateFailureClusterBody {
  status?: string;
  resolution_notes?: string;
  label?: string;
  description?: string;
  severity?: string;
}

export interface FailureClusterListOpts {
  agent_id?: string;
  status?: string;
  cluster_type?: string;
}

export interface AddClusterMemberBody {
  trace_node_id: string;
  session_id: string;
}
