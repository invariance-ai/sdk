export type SignalSource = 'monitor' | 'anomaly' | 'emit';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Signal {
  id: string;
  source: SignalSource;
  severity: SignalSeverity;
  owner_id: string;
  monitor_id: string | null;
  trace_node_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  title: string;
  message: string;
  matched_value: unknown | null;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export interface SignalQuery {
  source?: SignalSource;
  severity?: SignalSeverity;
  agent_id?: string;
  session_id?: string;
  monitor_id?: string;
  acknowledged?: boolean;
  after_id?: string;
  limit?: number;
}

export interface CreateSignalBody {
  title: string;
  message?: string;
  severity?: SignalSeverity;
  agent_id?: string;
  session_id?: string;
  trace_node_id?: string;
  metadata?: Record<string, unknown>;
}

export interface BulkAcknowledgeSignalsBody {
  signal_ids?: string[];
  filter?: {
    source?: SignalSource;
    severity?: SignalSeverity;
    agent_id?: string;
    session_id?: string;
    monitor_id?: string;
  };
}

export interface SignalStats {
  total: number;
  by_source: Record<string, number>;
  by_severity: Record<string, number>;
  unacknowledged: number;
}
