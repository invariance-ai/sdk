/** Error callback for non-fatal issues (e.g. flush failures) */
export type ErrorHandler = (error: unknown) => void;

/** SDK configuration */
export interface InvarianceConfig {
  /** API key for authentication */
  apiKey: string;
  /** API base URL (default: https://api.invariance.dev) */
  apiUrl?: string;
  /** Local policy rules to evaluate before recording */
  policies?: PolicyRule[];
  /** How often to flush batched receipts in ms (default: 5000) */
  flushIntervalMs?: number;
  /** Max receipts to batch before auto-flush (default: 50) */
  maxBatchSize?: number;
  /** Callback for non-fatal errors */
  onError?: ErrorHandler;
  /** Maximum number of receipts to queue before dropping oldest (default: 1000) */
  maxQueueSize?: number;
  /** Ed25519 private key (hex) for signing receipts. Optional — omit for unsigned hash-chained receipts. */
  privateKey?: string;
  /** Observability mode: DEV (full fidelity, no crypto) or PROD (sampled, signed) */
  mode?: 'DEV' | 'PROD';
  /** Override default sample rate (PROD only, default: 0.01) */
  sampleRate?: number;
  /** Override default anomaly threshold (PROD only, default: 0.7) */
  anomalyThreshold?: number;
  /** Callback when an anomalous trace event is detected */
  onAnomaly?: (node: import('./observability/types.js').TraceEvent) => void;
  /** DEV mode output: 'ui' | 'console' | 'both' (default: 'console') */
  devOutput?: 'ui' | 'console' | 'both';
  /** Enable replay snapshot capture (default: false) */
  captureReplaySnapshots?: boolean;
  /** Replay context retention mode (default: { type: 'last' }) */
  replayContext?: import('./observability/types.js').ReplayContextMode;
  /** Callback when a monitor triggers on a trace event */
  onMonitorTrigger?: (event: MonitorTriggerEvent) => void;
  /** How often to poll for monitor events in ms (default: 30000) */
  monitorPollIntervalMs?: number;
}

/** Template metadata used for richer action visualization. */
export interface ActionTemplate {
  /** Human-friendly action label shown in dashboards */
  label: string;
  /** Optional category (e.g. read, write, decision) */
  category?: string;
  /** Optional icon token for UI rendering */
  icon?: string;
  /** Ordered keys to highlight from input/output */
  highlights?: string[];
  /** Optional short description */
  description?: string;
  /** Optional JSON-schema-like input descriptor */
  inputSchema?: Record<string, unknown>;
  /** Optional JSON-schema-like output descriptor */
  outputSchema?: Record<string, unknown>;
}

/** An agent record returned by the admin agent APIs. */
export interface AgentRecord {
  id: string;
  name: string;
  api_key?: string;
  public_key: string;
  private_key?: string;
  created_at?: string;
}

/** An action template stored for a backend agent. */
export interface AgentActionTemplate {
  id?: string;
  agent_id?: string;
  action: string;
  label: string;
  category?: string;
  icon?: string | null;
  highlights?: string[];
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** An allow/deny action policy stored for a backend agent. */
export interface AgentActionPolicy {
  id?: string;
  agent_id?: string;
  action: string;
  effect: 'allow' | 'deny';
  created_at?: string;
  updated_at?: string;
}

/** An action performed by an agent */
export interface Action {
  /** Agent identifier (defaults to session agent if omitted) */
  agent?: string;
  /** Action name (e.g. "swap", "transfer", "chat.send") */
  action: string;
  /** Action inputs / parameters */
  input: Record<string, unknown>;
  /** Action output / result (set after execution) */
  output?: Record<string, unknown>;
  /** Error message if the action failed */
  error?: string;
  /** Freeform tags for filtering */
  tags?: string[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/** A hash-chained, signed receipt of an action */
export interface Receipt {
  /** Unique receipt ID (ULID) */
  id: string;
  /** Session this receipt belongs to */
  sessionId: string;
  /** Agent that performed the action */
  agent: string;
  /** Action name */
  action: string;
  /** Action inputs */
  input: Record<string, unknown>;
  /** Action output */
  output?: Record<string, unknown>;
  /** Error if action failed */
  error?: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** SHA-256 hash of canonical receipt data */
  hash: string;
  /** Hash of the previous receipt in the chain ("0" for first) */
  previousHash: string;
  /** Ed25519 signature over `hash` (null when no privateKey provided) */
  signature: string | null;
  /** Contract ID if this receipt is part of a contract */
  contractId?: string;
  /** Counter-party agent ID for cross-party receipts */
  counterAgentId?: string;
  /** Counter-party signature for cross-party receipts */
  counterSignature?: string;
}

/** A session groups a sequence of hash-chained receipts */
export interface SessionInfo {
  /** Unique session ID (ULID) */
  id: string;
  /** Agent that owns this session */
  agent: string;
  /** Human-readable session name */
  name: string;
  /** Session status */
  status: 'open' | 'closed' | 'tampered';
  /** Number of receipts in this session */
  receiptCount: number;
}

/** A session record returned by the backend session APIs. */
export interface RemoteSession extends SessionInfo {
  created_by: string;
  created_at: string;
  closed_at?: string | null;
  close_hash?: string | null;
  receipt_count?: number;
}

/** A policy rule that constrains agent actions */
export interface PolicyRule {
  /** Action name pattern to match (* for wildcard) */
  action: string;
  /** Max USD amount per action */
  maxAmountUsd?: number;
  /** Allowed values for a specific input field */
  allowlist?: { field: string; values: string[] };
  /** Rate limit: max N actions per window */
  rateLimit?: { max: number; windowMs: number };
  /** Custom predicate — return false to deny */
  custom?: (action: Action) => boolean;
}

/** Result of a policy check */
export interface PolicyCheck {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if denied) */
  reason?: string;
}

/** Filters for querying receipts */
export interface ReceiptQuery {
  sessionId?: string;
  agent?: string;
  action?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  offset?: number;
}

/** Terms of a contract between two agents */
export interface ContractTerms {
  description: string;
  deliverables: string[];
  [key: string]: unknown;
}

/** A contract between two agents */
export interface Contract {
  id: string;
  requestorId: string;
  providerId: string;
  sessionId: string;
  terms: ContractTerms;
  termsHash: string;
  requestorSignature: string;
  providerSignature?: string;
  status: 'proposed' | 'accepted' | 'active' | 'settled' | 'disputed' | 'expired';
  settlementHash?: string;
  settlementProof?: SettlementProof;
  createdAt: string;
}

/** Proof of delivery submitted by a provider */
export interface DeliveryProof {
  id: string;
  contractId: string;
  providerId: string;
  outputHash: string;
  outputData: Record<string, unknown>;
  signature: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestorSignature?: string;
}

/** Settlement proof for a completed contract */
export interface SettlementProof {
  contractId: string;
  termsHash: string;
  settlementHash: string;
  sessionId: string;
  sessionValid: boolean;
  deliveryCount: number;
  signatures: {
    requestor: string;
    provider: string;
  };
  deliveries: Array<{ id: string; outputHash: string }>;
  settledAt: string;
}

export interface VerifyResult {
  valid: boolean;
  receiptCount: number;
  errors: Array<{ index: number; reason: string }>;
}

/** Agent identity in the form {org}/{name} */
export interface AgentIdentity {
  /** Owner handle or org name */
  org: string;
  /** Agent name */
  name: string;
  /** Full identity string "org/name" */
  fullIdentity: string;
}

/** A monitor trigger event received from the backend */
export interface MonitorTriggerEvent {
  event_id: string;
  monitor_id: string;
  monitor_name: string;
  severity: string;
  trace_node_id: string;
  matched_value: Record<string, unknown>;
  created_at: string;
}

/** A signal surfaced from monitor events for dashboard and SDK consumers */
export interface MonitorSignal extends MonitorTriggerEvent {
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

/** Source reference in a natural language query response */
export interface QuerySource {
  node_id: string;
  session_id: string;
  agent_id: string;
  action_type: string;
  /** Semantic context or action_type label */
  label: string;
  /** Why this source was cited */
  relevance: string;
}

/** Scope/context constraints for a natural language query */
export interface NLQueryScope {
  session_id?: string;
  agent_id?: string;
  time_range?: { from?: number; to?: number; since?: number; until?: number };
}

/** Options for a natural language query */
export interface NLQueryOptions {
  conversation_id?: string;
  context?: NLQueryScope;
}

/** Result of a natural language query */
export interface NLQueryResult {
  answer: string;
  conversation_id: string;
  data_sources: Array<{ type: string; count: number; query_description: string }>;
  structured_results?: Array<{ type: 'table' | 'card' | 'timeline' | 'metric'; title: string; data: unknown }>;
  trace_context?: {
    session_id: string;
    nodes: unknown[];
    highlighted_node_ids: string[];
    causal_chain?: unknown;
  };
  confidence: number;
}

/** Result from a trace query */
export interface TraceQueryResult {
  data: unknown[] | null;
  query?: unknown;
  error?: string;
}

/** MCP-compatible tool schema */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Stats result from session or agent stats query */
export interface StatsResult {
  data: unknown[] | null;
  error?: string;
}

/** Agent note */
export interface AgentNote {
  id: string;
  key: string;
  owner_id: string;
  content: unknown;
  session_id?: string;
  node_id?: string;
  expires_at?: string;
  created_at: string;
}

/** A scoped API key issued from /v1/api-keys. */
export interface ApiKeyRecord {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  created_at: string;
  revoked_at?: string | null;
}

/** Body for creating a scoped API key. */
export interface CreateApiKeyBody {
  name?: string;
  scopes?: string[];
}

/** A usage event returned from /v1/usage. */
export interface UsageEvent {
  id: string;
  developer_id: string;
  org_id: string | null;
  event_type: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  agent_identity?: string | null;
}

/** Filters for querying usage events. */
export interface UsageQuery {
  event_type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Minimal structured API docs payload returned by /v1/docs. */
export interface ApiDocs {
  version: string;
  baseUrl: string;
  websiteDocs: string;
  sdkPackage: string;
  endpoints: Array<{
    method: string;
    path: string;
    auth?: string;
    description?: string;
  }>;
  sdkMethods?: Array<{
    method: string;
    description?: string;
  }>;
  [key: string]: unknown;
}

// ── Monitor types ──

/** A monitor definition from the backend */
export interface Monitor {
  id: string;
  name: string;
  natural_language: string;
  compiled_condition: Record<string, unknown>;
  agent_id: string | null;
  severity: string;
  status: 'active' | 'paused';
  webhook_url: string | null;
  owner_id: string;
  triggers_count: number;
  last_triggered: string | null;
  created_at: string;
  updated_at: string;
}

/** Body for creating a monitor */
export interface CreateMonitorBody {
  name: string;
  natural_language: string;
  agent_id?: string;
  severity?: string;
  webhook_url?: string;
}

/** Body for updating a monitor */
export interface UpdateMonitorBody {
  name?: string;
  natural_language?: string;
  status?: string;
  severity?: string;
  webhook_url?: string;
  agent_id?: string;
}

/** Result of manually evaluating a monitor */
export interface MonitorEvaluateResult {
  monitor_id: string;
  matches_found: number;
  matched_node_ids: string[];
}

/** Result of compiling a monitor rule preview */
export interface MonitorCompilePreview {
  compiled: Record<string, unknown>;
}

// ── Eval types (remote) ──

/** An eval suite stored on the backend */
export interface EvalSuiteRemote {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  owner_id: string;
  config: Record<string, unknown>;
  case_count?: number;
  latest_pass_rate?: number | null;
  latest_version_label?: string | null;
  created_at: string;
  updated_at: string;
}

/** Body for creating an eval suite */
export interface CreateEvalSuiteBody {
  name: string;
  description?: string;
  agent_id?: string;
  config?: Record<string, unknown>;
}

/** An eval case */
export interface EvalCase {
  id: string;
  suite_id: string;
  name: string;
  type: 'assertion' | 'judge';
  assertion_config: Record<string, unknown> | null;
  judge_config: Record<string, unknown> | null;
  weight: number;
  created_at: string;
}

/** Body for creating an eval case */
export interface CreateEvalCaseBody {
  name: string;
  type: 'assertion' | 'judge';
  assertion_config?: Record<string, unknown>;
  judge_config?: Record<string, unknown>;
  weight?: number;
}

/** An eval run */
export interface EvalRun {
  id: string;
  suite_id: string;
  agent_id: string;
  version_label: string | null;
  status: 'running' | 'completed' | 'failed';
  pass_rate: number | null;
  avg_score: number | null;
  owner_id: string;
  metadata: Record<string, unknown>;
  results?: EvalCaseResult[];
  created_at: string;
  completed_at: string | null;
}

/** A single eval case result within a run */
export interface EvalCaseResult {
  id: string;
  run_id: string;
  case_id: string;
  case_name?: string;
  case_type?: string;
  passed: boolean;
  score: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** Body for triggering an eval run */
export interface RunEvalBody {
  agent_id: string;
  version_label?: string;
  session_ids?: string[];
}

/** Result of comparing two eval runs */
export interface EvalCompareResult {
  run_a: EvalRun;
  run_b: EvalRun;
  overall_delta: {
    pass_rate: number;
    avg_score: number;
  };
  per_case: Array<{
    case_id: string;
    case_name: string;
    a_passed: boolean;
    b_passed: boolean;
    a_score: number | null;
    b_score: number | null;
    delta: number | null;
  }>;
  regressions: number;
  improvements: number;
}

/** An eval threshold definition */
export interface EvalThreshold {
  id: string;
  suite_id: string;
  metric: 'pass_rate' | 'avg_score';
  min_value: number;
  webhook_url: string | null;
  status: 'active' | 'paused';
  owner_id: string;
  created_at: string;
  updated_at?: string;
}

/** Body for creating an eval threshold */
export interface CreateEvalThresholdBody {
  suite_id: string;
  metric?: 'pass_rate' | 'avg_score';
  min_value: number;
  webhook_url?: string;
}

/** Body for updating an eval threshold */
export interface UpdateEvalThresholdBody {
  metric?: 'pass_rate' | 'avg_score';
  min_value?: number;
  webhook_url?: string | null;
  status?: 'active' | 'paused';
}

/** A failure cluster definition */
export interface FailureCluster {
  id: string;
  agent_id: string;
  cluster_type:
    | 'wrong_tool_call'
    | 'hallucinated_output'
    | 'context_drift'
    | 'loop'
    | 'timeout'
    | 'chain_broken'
    | 'policy_violation'
    | 'other';
  label: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurrence_count: number;
  status: 'open' | 'acknowledged' | 'resolved';
  owner_id: string;
  first_seen?: string | null;
  last_seen?: string | null;
  updated_at?: string;
  member_count?: number;
  members?: FailureClusterMember[];
}

/** Body for creating a failure cluster */
export interface CreateFailureClusterBody {
  agent_id: string;
  cluster_type: FailureCluster['cluster_type'];
  label: string;
  description?: string;
  severity?: FailureCluster['severity'];
}

/** Body for updating a failure cluster */
export interface UpdateFailureClusterBody {
  status?: FailureCluster['status'];
  resolution_notes?: string;
  label?: string;
  description?: string;
  severity?: FailureCluster['severity'];
}

/** A member of a failure cluster */
export interface FailureClusterMember {
  id: string;
  cluster_id: string;
  trace_node_id: string;
  session_id: string;
  added_at?: string;
}

/** Body for adding a member to a failure cluster */
export interface AddFailureClusterMemberBody {
  trace_node_id: string;
  session_id: string;
}

/** An optimization suggestion */
export interface OptimizationSuggestion {
  id: string;
  agent_id: string;
  suggestion_type: 'prompt_change' | 'routing_adjustment' | 'tool_selection' | 'model_swap' | 'config_change';
  title: string;
  description: string;
  cluster_id: string | null;
  confidence: number;
  evidence: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'rejected' | 'implemented';
  owner_id: string;
  created_at: string;
  updated_at?: string;
}

/** Body for creating an optimization suggestion */
export interface CreateOptimizationSuggestionBody {
  agent_id: string;
  suggestion_type: OptimizationSuggestion['suggestion_type'];
  title: string;
  description: string;
  cluster_id?: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
}

/** Body for updating an optimization suggestion */
export interface UpdateOptimizationSuggestionBody {
  status?: OptimizationSuggestion['status'];
  title?: string;
  description?: string;
  confidence?: number;
}

// ── Training types ──

/** A training pair linking source and student agents */
export interface TrainingPair {
  id: string;
  source_agent: string;
  student_agent: string;
  source_sessions: string[];
  status: 'pending' | 'training' | 'completed' | 'failed';
  progress?: number;
  traces_shared?: number;
  improvements?: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
}

/** Body for creating a training pair */
export interface CreateTrainingPairBody {
  source_agent: string;
  student_agent: string;
  source_sessions?: string[];
}

/** Body for updating a training pair */
export interface UpdateTrainingPairBody {
  status?: 'pending' | 'training' | 'completed' | 'failed';
  progress?: number;
  traces_shared?: number;
  improvements?: Record<string, unknown> | unknown[];
  source_sessions?: string[];
}

/** A flag on a trace node for training feedback */
export interface TraceFlag {
  id: string;
  trace_node_id: string;
  session_id: string;
  agent_id: string;
  flag: 'good' | 'bad' | 'needs_review';
  notes: string | null;
  flagged_by: string;
  created_at: string;
  updated_at: string;
}

/** Body for creating a trace flag */
export interface CreateTraceFlagBody {
  trace_node_id: string;
  flag: 'good' | 'bad' | 'needs_review';
  notes?: string;
}

/** Body for updating a trace flag */
export interface UpdateTraceFlagBody {
  flag?: 'good' | 'bad' | 'needs_review';
  notes?: string | null;
}

/** Aggregated trace flag statistics */
export interface TraceFlagStats {
  total: number;
  good: number;
  bad: number;
  needs_review: number;
  by_agent: Record<string, { good: number; bad: number; needs_review: number }>;
}

/** Root-cause investigation synthesized for a trace flag */
export interface TraceFlagInvestigation {
  flag_id: string;
  trace_node_id: string;
  session_id: string;
  agent_id: string;
  root_cause: string;
  suggestion: string;
  new_prompt: string;
  recommended_suite_id: string | null;
}

/** Body for rerunning a flagged trace via training/evals */
export interface TraceFlagRerunBody {
  version_label?: string;
  suite_id?: string;
  new_prompt?: string;
}

/** Result of rerunning a flagged trace */
export interface TraceFlagRerunResult {
  training_pair: TrainingPair;
  investigation: TraceFlagInvestigation;
  run: EvalRun | null;
  baseline_run: EvalRun | null;
  summary: {
    passed: boolean;
    score: number | null;
    version: string;
    baseline_score?: number | null;
    warning?: string;
  };
}

// ── Drift types ──

/** A detected drift catch between two sessions */
export interface DriftCatch {
  id: string;
  session_a: string;
  session_b: string;
  agent: string;
  task: string;
  similarity_score: number;
  divergence_reason: string;
  caught_at: number;
  severity: 'low' | 'medium' | 'high';
}

/** Detailed drift comparison between two sessions */
export interface DriftComparison {
  run_a: {
    id: string;
    session_id: string;
    agent_id: string;
    task: string;
    timestamp: number;
    node_count: number;
    status: 'normal' | 'drifted';
  };
  run_b: {
    id: string;
    session_id: string;
    agent_id: string;
    task: string;
    timestamp: number;
    node_count: number;
    status: 'normal' | 'drifted';
  };
  divergence_point: number | null;
  divergence_reason: string;
  similarity_score: number;
  aligned_steps: Array<{
    index: number;
    node_a: { action: string; semantic_context: string; anomaly_score: number } | null;
    node_b: { action: string; semantic_context: string; anomaly_score: number } | null;
    aligned: boolean;
    drift_type?: 'added' | 'removed' | 'changed';
  }>;
}

// ── Template types ──

/** A template pack containing preconfigured monitors */
export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  category: string;
  monitors: Array<{
    name: string;
    rule: string;
    severity: string;
    enabled_default: boolean;
  }>;
}

/** Result of applying a template pack */
export interface TemplateApplyResult {
  pack_id: string;
  monitors_created: number;
  monitors: unknown[];
}

// ── Identity types ──

/** A rich identity record from the identities endpoint */
export interface IdentityRecord {
  id: string;
  name: string;
  display_name: string;
  org: string;
  org_display: string;
  public_key: string;
  key_fingerprint: string;
  created_at: string;
  verified: boolean;
  capabilities: string[];
  description: string;
  session_count: number;
  last_active: string;
  identity_type: 'org_scoped' | 'legacy';
}

// ── A2A Query types ──

/** An A2A conversation summary */
export interface A2AConversation {
  id: string;
  agent_a_id: string;
  agent_a: string;
  agent_b_id: string;
  agent_b: string;
  participants: Array<{ id: string; name: string }>;
  session_ids: string[];
  message_count: number;
  started_at: number;
  last_message_at: number;
  status: 'active' | 'completed';
  all_countersigned: boolean;
  pending_count: number;
  verified_count: number;
  topic: string;
  protocol: string;
  root_trace_node_id: string | null;
  parent_trace_node_id: string | null;
  latest_message_preview: string;
}

/** An A2A message */
export interface A2AMessage {
  id: string;
  conversation_id: string;
  message_id: string;
  parent_message_id: string | null;
  trace_node_id: string | null;
  parent_trace_node_id: string | null;
  session_ids: string[];
  from_agent_id: string;
  to_agent_id: string;
  from_agent_name: string;
  to_agent_name: string;
  timestamp: number;
  status: 'pending' | 'verified';
  verified: boolean;
  sender_signature: string | null;
  receiver_signature: string | null;
  hash: string;
  previous_hash: string;
  payload_hash: string | null;
  content: string;
  content_preview: string;
  message_type: string;
  protocol: string;
  metadata: Record<string, unknown>;
}

/** A peer agent in A2A communication */
export interface A2APeer {
  agent_id: string;
  agent_name: string;
  sent: number;
  received: number;
  pending: number;
  verified: number;
}

// ── Search types ──

/** A search result item */
export interface SearchResult {
  type: 'session' | 'agent' | 'anomaly';
  id: string;
  label: string;
  subtitle?: string;
}
