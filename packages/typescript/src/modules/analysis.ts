import type { ResourcesModule } from './resources.js';
import type { GraphDomain, OntologyNodeQuery, OntologyEdgeQuery } from '../types/semantic-facts.js';

export class AnalysisModule {
  constructor(private _resources: ResourcesModule) {}

  // ── Product-facing capability names ──

  /** Semantic graph queries over agent behavior */
  get query() { return this._resources.query; }

  /** Natural language and global search across agent data */
  get search() {
    return {
      /** Natural language query interface */
      nl: this._resources.nlQuery,
      /** Global search across sessions and agents */
      global: this._resources.search,
    };
  }

  /** Drift detection and comparison between runs */
  get drift() { return this._resources.drift; }

  /** Session replay and timeline analysis */
  get replay() {
    return {
      timeline: (sessionId: string) => this._resources.trace.getReplay(sessionId),
      snapshot: (nodeId: string) => this._resources.trace.getNodeSnapshot(nodeId),
    };
  }

  /** Audit trail generation and verification */
  get audit() {
    return {
      generate: (sessionId: string, nodeId?: string) => this._resources.trace.generateAudit(sessionId, nodeId),
      verify: (sessionId: string) => this._resources.trace.verifyChain(sessionId),
    };
  }

  /** Semantic behavior graph queries and patterns */
  get graph() {
    return {
      snapshot: (opts?: { sessionId?: string }) => this._resources.trace.getGraphSnapshot(opts),
      patterns: (opts?: Parameters<typeof this._resources.trace.getPatterns>[0]) => this._resources.trace.getPatterns(opts),
      /** Get business or agent graph snapshot, or the linked view of both. */
      ontology: (domain: GraphDomain | 'linked' = 'linked') => this._resources.trace.getOntologyGraphSnapshot(domain),
      /** Query ontology nodes with filters (domain, type, score, search). */
      ontologyNodes: (query?: OntologyNodeQuery) => this._resources.trace.getOntologyNodes(query),
      /** Query ontology edges with filters. */
      ontologyEdges: (query?: OntologyEdgeQuery) => this._resources.trace.getOntologyEdges(query),
      /** Get a node's neighborhood — all connected nodes and edges within depth hops. */
      ontologyNeighborhood: (nodeId: string, depth?: number) => this._resources.trace.getOntologyNeighborhood(nodeId, depth),
      /** Explain why a node or edge was inferred — returns evidence links and aggregates. */
      ontologyEvidence: (nodeId: string) => this._resources.trace.getOntologyNodeEvidence(nodeId),
    };
  }

  /** Semantic fact extraction and aggregation */
  get semantic() {
    return {
      facts: (sessionId: string) => this._resources.trace.getSessionSemanticFacts(sessionId),
      nodeFacts: (nodeId: string) => this._resources.trace.getNodeSemanticFacts(nodeId),
      query: (query?: Parameters<typeof this._resources.trace.getSemanticFacts>[0]) => this._resources.trace.getSemanticFacts(query),
      aggregates: (query?: Parameters<typeof this._resources.trace.getSemanticFactAggregates>[0]) => this._resources.trace.getSemanticFactAggregates(query),
    };
  }

  /** Real-time status and usage analytics */
  get live() {
    return {
      status: this._resources.status,
      usage: this._resources.usage,
    };
  }

  // ── Legacy aliases ──

  /** @deprecated Use `search.nl` instead */
  get nlQuery() { return this._resources.nlQuery; }

  // ── Ontology Graph (legacy top-level accessors) ──

  /** @deprecated Use `graph.ontology` instead */
  async ontologyGraph(domain: GraphDomain | 'linked' = 'linked') {
    return this._resources.trace.getOntologyGraphSnapshot(domain);
  }

  /** @deprecated Use `graph.ontologyNodes` instead */
  async ontologyNodes(query?: OntologyNodeQuery) {
    return this._resources.trace.getOntologyNodes(query);
  }

  /** @deprecated Use `graph.ontologyEdges` instead */
  async ontologyEdges(query?: OntologyEdgeQuery) {
    return this._resources.trace.getOntologyEdges(query);
  }

  /** @deprecated Use `graph.ontologyNeighborhood` instead */
  async ontologyNeighborhood(nodeId: string, depth?: number) {
    return this._resources.trace.getOntologyNeighborhood(nodeId, depth);
  }

  /** @deprecated Use `graph.ontologyEvidence` instead */
  async ontologyEvidence(nodeId: string) {
    return this._resources.trace.getOntologyNodeEvidence(nodeId);
  }
}
