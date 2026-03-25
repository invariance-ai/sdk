export interface Monitor {
  id: string;
  name: string;
  natural_language: string;
  compiled_condition?: unknown;
  agent_id: string | null;
  owner_id: string;
  status: 'active' | 'paused' | 'disabled';
  severity: 'low' | 'medium' | 'high' | 'critical';
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMonitorBody {
  name: string;
  natural_language: string;
  agent_id?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  webhook_url?: string;
}

export interface UpdateMonitorBody {
  name?: string;
  natural_language?: string;
  status?: 'active' | 'paused' | 'disabled';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  webhook_url?: string;
  agent_id?: string;
}

export interface MonitorEvaluateResult {
  monitor_id: string;
  matches_found: number;
  matched_node_ids: string[];
}

/** @deprecated Use `Signal` from `./signal.js` instead. */
export interface MonitorSignal {
  id: string;
  monitor_id: string;
  monitor_name: string;
  node_id: string;
  session_id: string;
  agent_id: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

/** @deprecated Use `SignalQuery` from `./signal.js` instead. */
export interface MonitorEventsQuery {
  monitor_id?: string;
  after_id?: string;
  limit?: number;
  acknowledged?: boolean;
}

export interface MonitorCompilePreview {
  compiled: unknown;
}
