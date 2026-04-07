import type { ResourcesModule } from './resources.js';
import type { GraphDomain, OntologyNodeQuery, OntologyEdgeQuery } from '../types/semantic-facts.js';

export class AnalysisModule {
  constructor(private _resources: ResourcesModule) {}

  get query() { return this._resources.query; }
  get nlQuery() { return this._resources.nlQuery; }
  get drift() { return this._resources.drift; }
  get search() { return this._resources.search; }
  get usage() { return this._resources.usage; }

  // ── Ontology Graph ──

  /** Get business or agent graph snapshot, or the linked view of both. */
  async ontologyGraph(domain: GraphDomain | 'linked' = 'linked') {
    return this._resources.trace.getOntologyGraphSnapshot(domain);
  }

  /** Query ontology nodes with filters (domain, type, score, search). */
  async ontologyNodes(query?: OntologyNodeQuery) {
    return this._resources.trace.getOntologyNodes(query);
  }

  /** Query ontology edges with filters. */
  async ontologyEdges(query?: OntologyEdgeQuery) {
    return this._resources.trace.getOntologyEdges(query);
  }

  /** Get a node's neighborhood — all connected nodes and edges within depth hops. */
  async ontologyNeighborhood(nodeId: string, depth?: number) {
    return this._resources.trace.getOntologyNeighborhood(nodeId, depth);
  }

  /** Explain why a node or edge was inferred — returns evidence links and aggregates. */
  async ontologyEvidence(nodeId: string) {
    return this._resources.trace.getOntologyNodeEvidence(nodeId);
  }
}
