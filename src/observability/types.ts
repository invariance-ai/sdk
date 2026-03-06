// ── Behavioral Primitives ──

export type BehavioralPrimitive =
  | 'DecisionPoint'
  | 'ToolInvocation'
  | 'SubAgentSpawn'
  | 'GoalDrift';

// ── Tracer Types ──

export type TracerMode = 'DEV' | 'PROD';

export type DevOutput = 'ui' | 'console' | 'both';

export interface TracerConfig {
  mode: TracerMode;
  sampleRate?: number;
  anomalyThreshold?: number;
  devOutput?: DevOutput;
  onAnomaly?: (node: TraceEvent) => void;
}

export interface TraceEvent {
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
