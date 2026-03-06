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
  /** Ed25519 private key (hex) for signing receipts */
  privateKey: string;
}

/** An action performed by an agent */
export interface Action {
  /** Agent identifier */
  agent: string;
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
  /** HMAC-SHA256 signature */
  signature: string;
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
