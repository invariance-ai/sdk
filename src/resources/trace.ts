import type { HttpClient } from '../http.js';
import type {
  TraceNode, TraceEventInput, ReplayTimelineEntry, ReplaySnapshot,
  CausalChain, AnomalyQuery, CounterfactualRequest, CounterfactualResult,
  AuditResult, GraphPattern, PatternQuery, GraphSnapshot, NodeDiff,
} from '../types/trace.js';

export class TraceResource {
  constructor(private http: HttpClient) {}

  async submitEvents(events: TraceEventInput | TraceEventInput[]): Promise<{ nodes: TraceNode[] }> {
    return this.http.post<{ nodes: TraceNode[] }>('/v1/trace/events', Array.isArray(events) ? events : [events]);
  }

  async submitBehaviors(behaviors: unknown): Promise<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/v1/trace/behaviors', behaviors);
  }

  async getSessionNodes(sessionId: string): Promise<{ nodes: TraceNode[] }> {
    return this.http.get<{ nodes: TraceNode[] }>(`/v1/trace/sessions/${sessionId}/nodes`);
  }

  async getReplay(sessionId: string): Promise<{ timeline: ReplayTimelineEntry[] }> {
    return this.http.get<{ timeline: ReplayTimelineEntry[] }>(`/v1/trace/sessions/${sessionId}/replay`);
  }

  async getNodeSnapshot(nodeId: string): Promise<ReplaySnapshot> {
    return this.http.get<ReplaySnapshot>(`/v1/trace/nodes/${nodeId}/snapshot`);
  }

  async getCausalChain(nodeId: string): Promise<CausalChain> {
    return this.http.get<CausalChain>(`/v1/trace/nodes/${nodeId}/causal-chain`);
  }

  async diffNodes(nodeIdA: string, nodeIdB: string): Promise<NodeDiff> {
    return this.http.get<NodeDiff>(`/v1/trace/nodes/${nodeIdA}/diff/${nodeIdB}`);
  }

  async getDependencyContext(nodeId: string): Promise<unknown> {
    return this.http.get(`/v1/trace/nodes/${nodeId}/dependency-context`);
  }

  async getAnomalies(opts?: AnomalyQuery): Promise<{ anomalies: TraceNode[]; total: number }> {
    return this.http.get<{ anomalies: TraceNode[]; total: number }>('/v1/trace/anomalies', {
      params: {
        minScore: opts?.minScore,
        limit: opts?.limit,
        offset: opts?.offset,
        agentId: opts?.agentId,
        sessionId: opts?.sessionId,
        since: opts?.since,
        until: opts?.until,
      },
    });
  }

  async generateReplay(sessionId: string, opts: CounterfactualRequest): Promise<CounterfactualResult> {
    return this.http.post<CounterfactualResult>(`/v1/trace/sessions/${sessionId}/generate-replay`, opts);
  }

  async generateAudit(sessionId: string, nodeId?: string): Promise<AuditResult> {
    return this.http.post<AuditResult>(`/v1/trace/sessions/${sessionId}/generate-audit`, { node_id: nodeId });
  }

  async getPatterns(opts?: PatternQuery): Promise<{ patterns: GraphPattern[] }> {
    return this.http.get<{ patterns: GraphPattern[] }>('/v1/trace/graph/patterns', {
      params: {
        agentId: opts?.agentId,
        actionType: opts?.actionType,
        limit: opts?.limit,
        since: opts?.since,
        until: opts?.until,
      },
    });
  }

  async getGraphSnapshot(opts?: { sessionId?: string }): Promise<GraphSnapshot> {
    return this.http.get<GraphSnapshot>('/v1/trace/graph/snapshot', {
      params: { sessionId: opts?.sessionId },
    });
  }

  async getNarrative(sessionId: string): Promise<{ narrative: string | null }> {
    return this.http.get<{ narrative: string | null }>(`/v1/trace/sessions/${sessionId}/narrative`);
  }
}
