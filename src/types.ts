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
