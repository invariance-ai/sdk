// ── Schema Version ──

export const TRACE_SCHEMA_VERSION = '1.0.0';

// ── Behavioral Primitives ──

export type BehavioralPrimitive =
  | 'DecisionPoint'
  | 'ToolInvocation'
  | 'SubAgentSpawn'
  | 'GoalDrift'
  | 'ConstraintCheck'
  | 'PlanRevision';

// ── Tracer Types ──

export type TracerMode = 'DEV' | 'PROD';

export type DevOutput = 'ui' | 'console' | 'both';

export interface TracerConfig {
  mode: TracerMode;
  sampleRate?: number;
  anomalyThreshold?: number;
  devOutput?: DevOutput;
  onAnomaly?: (node: TraceEvent) => void;
  random?: () => number;
  now?: () => number;
  replayContext?: ReplayContextMode;
  captureReplaySnapshots?: boolean;
  onError?: (error: unknown) => void;
  maxSessionTreeSize?: number;
}

export interface TraceEvent {
  schemaVersion: string;
  nodeId: string;
  sessionId: string;
  parentNodeId?: string;
  spanId: string;
  agentId: string;
  actionType: BehavioralPrimitive;
  input: unknown;
  output?: unknown;
  error?: string;
  metadata: TraceMetadata;
  timestamp: number;
  durationMs: number;
  hash: string;
  previousHash: string;
  contextHash?: string;
  previousContextHash?: string;
  anomalyScore: number;
}

export interface TraceMetadata {
  depth: number;
  tokenCost?: number;
  toolCalls?: string[];
}

// ── Behavioral Primitive Payloads ──

export interface DecisionPointPayload {
  nodeId: string;
  candidates: string[];
  chosen: string;
  depth: number;
}

export interface GoalDriftPayload {
  nodeId: string;
  originalGoal: string;
  currentGoal: string;
  similarity: number;
}

export interface SubAgentSpawnPayload {
  parentNodeId: string;
  childAgentId: string;
  depth: number;
}

export interface ToolInvocationPayload {
  nodeId: string;
  tool: string;
  inputHash: string;
  outputHash: string;
  latencyMs: number;
}

export type BehavioralPayload =
  | { type: 'DecisionPoint'; data: DecisionPointPayload }
  | { type: 'ToolInvocation'; data: ToolInvocationPayload }
  | { type: 'SubAgentSpawn'; data: SubAgentSpawnPayload }
  | { type: 'GoalDrift'; data: GoalDriftPayload };

// ── Replay Types ──

export type ReplayContextMode =
  | { type: 'full' }
  | { type: 'last' }
  | { type: 'window'; size: number };

export interface ReplaySnapshot {
  nodeId: string;
  sessionId: string;
  timestamp: number;
  /** LLM messages at this point */
  llmMessages?: unknown[];
  /** Tool call results */
  toolResults?: unknown[];
  /** RAG chunks retrieved */
  ragChunks?: unknown[];
  /** External data reads */
  externalReads?: unknown[];
  /** Arbitrary context data */
  custom?: Record<string, unknown>;
}

export interface ReplayTimelineEntry {
  nodeId: string;
  actionType: BehavioralPrimitive;
  timestamp: number;
  durationMs: number;
  hash: string;
  contextHash: string;
  hasSnapshot: boolean;
  agentId: string;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
}

export interface CounterfactualRequest {
  /** Node ID to branch from */
  branchFromNodeId: string;
  /** Modified input for the counterfactual */
  modifiedInput: unknown;
  /** Optional modified action type */
  modifiedActionType?: BehavioralPrimitive;
  /** Tag for this counterfactual run */
  tag?: string;
}

export interface CounterfactualResult {
  originalNodeId: string;
  counterfactualNodeId: string;
  branchSessionId: string;
  tag?: string;
}

// ── Verification ──

export interface VerificationProof {
  valid: boolean;
  executionId: string;
  chain: { nodeId: string; hash: string; actionType: string; anomalyScore: number }[];
  signedBy: string;
  anchored: boolean;
  anchoredAt?: Date;
  tamperedNodes?: string[];
}

// ── Trace Action (for wrap-style API) ──

export interface TraceAction {
  type: BehavioralPrimitive;
  tool?: string;
  input: unknown;
}
