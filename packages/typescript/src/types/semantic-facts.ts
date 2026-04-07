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
  | 'session_role'
  // Business-domain fact kinds
  | 'workflow_membership'
  | 'business_entity_reference'
  | 'business_outcome'
  | 'policy_binding'
  | 'risk_association'
  // Agent-coordination fact kinds
  | 'agent_handoff'
  | 'tool_dependency'
  | 'plan_step'
  | 'capability_execution'
  | 'monitor_trigger';

export type SemanticEntityType =
  | 'agent' | 'tool' | 'artifact' | 'goal' | 'constraint' | 'signal' | 'variant' | 'session' | 'node'
  | 'workflow' | 'business_entity' | 'policy' | 'risk' | 'outcome'
  | 'monitor' | 'plan' | 'capability';

export interface SemanticEntity {
  type: SemanticEntityType;
  id: string;
  label: string;
}

export interface SemanticProvenance {
  source: 'trace_extractor' | 'signal_extractor' | 'eval_extractor' | 'compare_extractor';
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
  | 'plays_role'
  | 'belongs_to_workflow'
  | 'references_entity'
  | 'produces_business_outcome'
  | 'constrained_by_policy'
  | 'associated_with_risk'
  | 'hands_off_to'
  | 'depends_on_tool'
  | 'executes_plan_step'
  | 'executes_capability'
  | 'triggers_monitor';

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

// ── Ontology Candidates (Legacy) ──

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

// ── Ontology Dual-Graph Types ──

export type GraphDomain = 'business' | 'agent' | 'cross_graph';

export type OntologyNodeStatus = 'candidate' | 'accepted' | 'merged' | 'deprecated' | 'rejected' | 'system';

export interface OntologyNode {
  id: string;
  graph_domain: GraphDomain;
  node_type: string;
  canonical_label: string;
  aliases: string[];
  score: number;
  confidence: number;
  status: OntologyNodeStatus;
  first_seen_at: number;
  last_seen_at: number;
  support_count: number;
  session_count: number;
  agent_ids: string[];
  attributes: Record<string, unknown>;
}

export interface OntologyEdge {
  id: string;
  graph_domain: GraphDomain;
  edge_type: string;
  source_node_id: string;
  target_node_id: string;
  score: number;
  confidence: number;
  support_count: number;
  directionality: 'directed' | 'undirected';
  temporal_character: 'instantaneous' | 'ongoing' | 'recurring' | 'unknown';
  attributes: Record<string, unknown>;
}

export interface OntologyEvidenceLink {
  id: string;
  ontology_id: string;
  ontology_kind: 'node' | 'edge';
  semantic_fact_id: string | null;
  aggregate_id: string | null;
  trace_node_id: string | null;
  session_id: string | null;
  weight: number;
}

export interface OntologyGraphSnapshot {
  domain: GraphDomain | 'linked';
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  node_count: number;
  edge_count: number;
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

export interface OntologyNodeQuery {
  graph_domain?: GraphDomain;
  node_type?: string;
  status?: OntologyNodeStatus;
  min_score?: number;
  min_confidence?: number;
  search?: string;
  agent_id?: string;
  limit?: number;
  offset?: number;
}

export interface OntologyEdgeQuery {
  graph_domain?: GraphDomain;
  edge_type?: string;
  source_node_id?: string;
  target_node_id?: string;
  min_score?: number;
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

export interface OntologyNodeListResponse {
  nodes: OntologyNode[];
  total: number;
}

export interface OntologyEdgeListResponse {
  edges: OntologyEdge[];
  total: number;
}

export interface OntologyEvidenceListResponse {
  evidence: OntologyEvidenceLink[];
}

export interface OntologyMineResult {
  concepts: number;
  relations: number;
  nodes: number;
  edges: number;
  evidence_links: number;
}
