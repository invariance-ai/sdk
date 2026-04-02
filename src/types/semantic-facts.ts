// ── Semantic Fact & Ontology SDK Types ──

// ── Semantic Facts ──

export type SemanticFactKind =
  | 'agent_capability'
  | 'tool_usage'
  | 'artifact_access'
  | 'goal_inference'
  | 'constraint_inference'
  | 'outcome_inference'
  | 'signal_association'
  | 'variant_delta'
  | 'session_role';

export interface SemanticEntity {
  type: 'agent' | 'tool' | 'artifact' | 'goal' | 'constraint' | 'signal' | 'variant' | 'session' | 'node';
  id: string;
  label: string;
}

export interface SemanticProvenance {
  source: 'trace_extractor';
  fields: string[];
}

export type SemanticPredicate =
  | 'uses_tool'
  | 'reads_artifact'
  | 'checks_constraint'
  | 'pursues_goal'
  | 'produces_outcome'
  | 'associated_with_signal'
  | 'changed_in_variant'
  | 'has_capability'
  | 'plays_role';

export interface SemanticFact {
  id: string;
  kind: SemanticFactKind;
  session_id: string;
  trace_node_id: string | null;
  agent_id: string;
  subject: SemanticEntity;
  predicate: string;
  object: SemanticEntity;
  attributes: Record<string, unknown>;
  confidence: number;
  provenance: SemanticProvenance;
}

export interface SemanticFactsResponse {
  session_id: string;
  facts: SemanticFact[];
  extracted_at: number;
}

export interface NodeSemanticFactsResponse {
  node_id: string;
  facts: SemanticFact[];
  extracted_at: number;
}

// ── Cross-Run Aggregation ──

export interface SemanticFactContradiction {
  fact_id_a: string;
  fact_id_b: string;
  field: string;
  value_a: unknown;
  value_b: unknown;
}

export interface SemanticFactAggregate {
  id: string;
  canonical_key: string;
  kind: SemanticFactKind;
  agent_id: string;
  subject: SemanticEntity;
  predicate: string;
  object: SemanticEntity;
  count: number;
  session_ids: string[];
  fact_ids: string[];
  first_seen: number;
  last_seen: number;
  avg_confidence: number;
  attributes_summary: Record<string, unknown>;
  contradictions: SemanticFactContradiction[];
}

// ── Ontology Candidates ──

export type OntologyCandidateKind = 'concept' | 'relation';

export interface OntologyConcept {
  entity_type: string;
  entity_id: string;
  label: string;
  occurrence_count: number;
  session_count: number;
  agent_ids: string[];
}

export interface OntologyRelation {
  source_concept_id: string;
  target_concept_id: string;
  relation_type: 'co_occurs_with' | 'shared_by_agent';
  strength: number;
  evidence_count: number;
}

export interface OntologyCandidate {
  id: string;
  kind: OntologyCandidateKind;
  concept?: OntologyConcept;
  relation?: OntologyRelation;
  evidence_ids: string[];
  score: number;
  machine_label: string;
  created_at: number;
  updated_at: number;
}

// ── Query Types ──

export interface SemanticFactQuery {
  session_id?: string;
  kind?: SemanticFactKind;
  agent_id?: string;
  trace_node_id?: string;
  min_confidence?: number;
  limit?: number;
  offset?: number;
}

export interface SemanticFactAggregateQuery {
  kind?: SemanticFactKind;
  agent_id?: string;
  min_count?: number;
  limit?: number;
  offset?: number;
}

export interface OntologyCandidateQuery {
  kind?: OntologyCandidateKind;
  min_score?: number;
  entity_type?: string;
  limit?: number;
  offset?: number;
}

// ── Response Wrappers ──

export interface SemanticFactListResponse {
  facts: SemanticFact[];
  total: number;
}

export interface SemanticFactAggregateListResponse {
  aggregates: SemanticFactAggregate[];
  total: number;
}

export interface OntologyCandidateListResponse {
  candidates: OntologyCandidate[];
  total: number;
}

export interface OntologyMineResult {
  concepts: number;
  relations: number;
}
