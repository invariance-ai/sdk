import type { HttpClient } from '../http.js';
import type {
  TraceNode, TraceEventInput, ReplayTimelineEntry, ReplaySnapshot,
  CausalChain, CounterfactualRequest, CounterfactualResult,
  AuditResult, GraphPattern, PatternQuery, GraphSnapshot, NodeDiff,
  TraceVerifyResult,
} from '../types/trace.js';
import type {
  SemanticFactsResponse, NodeSemanticFactsResponse,
  SemanticFactQuery, SemanticFactListResponse,
  SemanticFactAggregateQuery, SemanticFactAggregateListResponse,
  OntologyCandidateQuery, OntologyCandidateListResponse,
  OntologyCandidate, OntologyMineResult,
  GraphDomain, OntologyNodeQuery, OntologyEdgeQuery,
  OntologyNode, OntologyGraphSnapshot,
  OntologyNodeListResponse, OntologyEdgeListResponse, OntologyEvidenceListResponse,
} from '../types/semantic-facts.js';

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

  async getSessionSummary(sessionId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${sessionId}/summary`);
  }

  async getSessionHandoffs(sessionId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${sessionId}/handoffs`);
  }

  async getSessionSignals(sessionId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${sessionId}/signals`);
  }

  async getSessionProof(sessionId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${sessionId}/proof`);
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

  async verifyChain(sessionId: string): Promise<TraceVerifyResult> {
    const payload = await this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${sessionId}/verify`);

    if (payload && typeof payload === 'object') {
      if (typeof payload.verified === 'boolean') {
        return {
          verified: payload.verified,
          errors: Array.isArray(payload.errors)
            ? (payload.errors as unknown[]).filter((item): item is string => typeof item === 'string')
            : [],
        };
      }
      if (typeof payload.valid === 'boolean') {
        return {
          verified: payload.valid,
          errors: typeof payload.error === 'string' ? [payload.error] : [],
        };
      }
    }

    return { verified: false, errors: ['Invalid verification response'] };
  }

  // ── Semantic Facts ──

  async getSessionSemanticFacts(sessionId: string): Promise<SemanticFactsResponse> {
    return this.http.get<SemanticFactsResponse>(`/v1/trace/sessions/${sessionId}/semantic-facts`);
  }

  async getNodeSemanticFacts(nodeId: string): Promise<NodeSemanticFactsResponse> {
    return this.http.get<NodeSemanticFactsResponse>(`/v1/trace/nodes/${nodeId}/semantic-facts`);
  }

  async getSemanticFacts(query?: SemanticFactQuery): Promise<SemanticFactListResponse> {
    return this.http.get<SemanticFactListResponse>('/v1/trace/semantic-facts', {
      params: query as Record<string, string | number | boolean | undefined> | undefined,
    });
  }

  async rebuildSessionSemanticFacts(sessionId: string): Promise<SemanticFactsResponse> {
    return this.http.post<SemanticFactsResponse>(`/v1/trace/sessions/${sessionId}/semantic-facts/rebuild`, {});
  }

  // ── Aggregates ──

  async getSemanticFactAggregates(query?: SemanticFactAggregateQuery): Promise<SemanticFactAggregateListResponse> {
    return this.http.get<SemanticFactAggregateListResponse>('/v1/trace/semantic-fact-aggregates', {
      params: query as Record<string, string | number | boolean | undefined> | undefined,
    });
  }

  // ── Ontology Candidates ──

  async getOntologyCandidates(query?: OntologyCandidateQuery): Promise<OntologyCandidateListResponse> {
    return this.http.get<OntologyCandidateListResponse>('/v1/trace/ontology-candidates', {
      params: query as Record<string, string | number | boolean | undefined> | undefined,
    });
  }

  async getOntologyCandidate(id: string): Promise<OntologyCandidate> {
    return this.http.get<OntologyCandidate>(`/v1/trace/ontology-candidates/${id}`);
  }

  async mineOntologyCandidates(): Promise<OntologyMineResult> {
    return this.http.post<OntologyMineResult>('/v1/trace/ontology-candidates/mine', {});
  }

  // ── Ontology Graph ──

  async getOntologyNodes(query?: OntologyNodeQuery): Promise<OntologyNodeListResponse> {
    return this.http.get<OntologyNodeListResponse>('/v1/trace/ontology/nodes', {
      params: query as Record<string, string | number | boolean | undefined> | undefined,
    });
  }

  async getOntologyNode(id: string): Promise<OntologyNode> {
    return this.http.get<OntologyNode>(`/v1/trace/ontology/nodes/${id}`);
  }

  async getOntologyNeighborhood(nodeId: string, depth?: number): Promise<OntologyGraphSnapshot> {
    return this.http.get<OntologyGraphSnapshot>(`/v1/trace/ontology/nodes/${nodeId}/neighborhood`, {
      params: { depth },
    });
  }

  async getOntologyNodeEvidence(nodeId: string): Promise<OntologyEvidenceListResponse> {
    return this.http.get<OntologyEvidenceListResponse>(`/v1/trace/ontology/nodes/${nodeId}/evidence`);
  }

  async getOntologyEdges(query?: OntologyEdgeQuery): Promise<OntologyEdgeListResponse> {
    return this.http.get<OntologyEdgeListResponse>('/v1/trace/ontology/edges', {
      params: query as Record<string, string | number | boolean | undefined> | undefined,
    });
  }

  async getOntologyEdgeEvidence(edgeId: string): Promise<OntologyEvidenceListResponse> {
    return this.http.get<OntologyEvidenceListResponse>(`/v1/trace/ontology/edges/${edgeId}/evidence`);
  }

  async getOntologyGraphSnapshot(domain: GraphDomain | 'linked'): Promise<OntologyGraphSnapshot> {
    return this.http.get<OntologyGraphSnapshot>(`/v1/trace/ontology/graph/${domain}`);
  }
}
