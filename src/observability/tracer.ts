import { ulid } from 'ulid';
import type {
  TracerConfig,
  TracerMode,
  TraceEvent,
  TraceMetadata,
  BehavioralPrimitive,
  BehavioralPayload,
  DecisionPointPayload,
  GoalDriftPayload,
  SubAgentSpawnPayload,
  ToolInvocationPayload,
  TraceAction,
  VerificationProof,
  ReplayContextMode,
  ReplaySnapshot,
} from './types.js';
import type { Transport } from '../transport.js';
import { sortedStringify, sha256 } from '../receipt.js';

const DEFAULT_SAMPLE_RATE = 0.01;
const DEFAULT_ANOMALY_THRESHOLD = 0.7;
const DEFAULT_HOT_PATH_TTL_MS = 300_000;
const DEFAULT_HOT_PATH_MAX_SIZE = 10_000;

export class InvarianceTracer {
  private readonly mode: TracerMode;
  private readonly sampleRate: number;
  private readonly anomalyThreshold: number;
  private readonly onAnomaly?: (node: TraceEvent) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly transport: Transport;
  private readonly devOutput: 'ui' | 'console' | 'both';
  private readonly rand: () => number;
  private readonly now: () => number;
  private readonly maxSessionTreeSize: number;

  private hotPaths = new Map<string, number>(); // spanId -> last_seen
  private lastHash = new Map<string, string>(); // sessionId -> last hash
  private sessionTrees = new Map<string, TraceEvent[]>(); // DEV mode tree
  private readonly replayContext: ReplayContextMode;
  private readonly captureReplaySnapshots: boolean;
  private snapshots = new Map<string, Map<string, ReplaySnapshot>>(); // sessionId -> nodeId -> snapshot
  private lastContextHash = new Map<string, string>(); // sessionId -> last context hash

  constructor(transport: Transport, config: TracerConfig) {
    this.mode = config.mode;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.anomalyThreshold = config.anomalyThreshold ?? DEFAULT_ANOMALY_THRESHOLD;
    this.onAnomaly = config.onAnomaly;
    this.onError = config.onError;
    this.transport = transport;
    this.devOutput = config.devOutput ?? 'console';
    this.rand = config.random ?? Math.random;
    this.now = config.now ?? Date.now;
    const replayContext = config.replayContext ?? { type: 'last' };
    this.replayContext = replayContext.type === 'window' && replayContext.size < 1
      ? { type: 'last' }
      : replayContext;
    this.captureReplaySnapshots = config.captureReplaySnapshots ?? false;
    this.maxSessionTreeSize = config.maxSessionTreeSize ?? 10_000;
  }

  async trace<T>(params: {
    agentId: string;
    sessionId: string;
    action: TraceAction;
    spanId?: string;
    parentNodeId?: string;
    metadata?: Partial<TraceMetadata>;
    fn: () => T | Promise<T>;
  }): Promise<{ result: T; event: TraceEvent }> {
    const startTime = this.now();
    const nodeId = ulid();
    const spanId = params.spanId ?? params.sessionId;
    let output: unknown;
    let error: string | undefined;
    let result: T;

    try {
      result = await params.fn();
      output = typeof result === 'object' && result !== null ? result : { value: result };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      // Build event for the error case, then re-throw
      const event = await this.buildAndSubmitEvent(nodeId, params, spanId, startTime, output, error);
      const enriched = err instanceof Error ? err : new Error(error);
      Object.assign(enriched, { traceEvent: event });
      throw enriched;
    }

    const event = await this.buildAndSubmitEvent(nodeId, params, spanId, startTime, output, error);
    return { result, event };
  }

  private async buildAndSubmitEvent(
    nodeId: string,
    params: { sessionId: string; parentNodeId?: string; agentId: string; action: TraceAction; metadata?: Partial<TraceMetadata> },
    spanId: string,
    startTime: number,
    output: unknown,
    error: string | undefined,
  ): Promise<TraceEvent> {
    const durationMs = this.now() - startTime;
    const anomalyScore = error ? 0.8 : 0;
    const previousHash = this.lastHash.get(params.sessionId) ?? '0';

    const hashData = sortedStringify({
      nodeId,
      sessionId: params.sessionId,
      parentNodeId: params.parentNodeId ?? null,
      agentId: params.agentId,
      actionType: params.action.type,
      input: params.action.input,
      output: output ?? null,
      error: error ?? null,
      timestamp: startTime,
      previousHash,
    });
    const hash = await sha256(hashData);

    const event: TraceEvent = {
      nodeId,
      sessionId: params.sessionId,
      parentNodeId: params.parentNodeId,
      spanId,
      agentId: params.agentId,
      actionType: params.action.type,
      input: params.action.input,
      output: output ?? undefined,
      error,
      metadata: {
        depth: params.metadata?.depth ?? 0,
        tokenCost: params.metadata?.tokenCost,
        toolCalls: params.metadata?.toolCalls,
      },
      timestamp: startTime,
      durationMs,
      hash,
      previousHash,
      anomalyScore,
    };

    this.lastHash.set(params.sessionId, hash);

    if (this.captureReplaySnapshots) {
      const snapshot: ReplaySnapshot = {
        nodeId,
        sessionId: params.sessionId,
        timestamp: startTime,
        llmMessages: params.action.input != null ? [params.action.input] : undefined,
        toolResults: output != null ? [output] : undefined,
      };
      const previousContextHash = this.lastContextHash.get(params.sessionId) ?? '0';
      const contextHashData = sortedStringify(snapshot) + previousContextHash;
      const contextHash = await sha256(contextHashData);
      event.contextHash = contextHash;
      event.previousContextHash = previousContextHash;
      this.lastContextHash.set(params.sessionId, contextHash);

      if (!this.snapshots.has(params.sessionId)) {
        this.snapshots.set(params.sessionId, new Map());
      }
      this.snapshots.get(params.sessionId)!.set(nodeId, snapshot);
      this.pruneSnapshots(params.sessionId);
    }

    if (this.mode === 'DEV' || this.shouldCapture(spanId, anomalyScore, error !== undefined)) {
      this.submitEvent(event);
    }

    if (anomalyScore >= this.anomalyThreshold) {
      this.onAnomaly?.(event);
    }

    if (this.mode === 'DEV') {
      this.trackDevTree(event);
    }

    return event;
  }

  emit(type: 'DecisionPoint', data: DecisionPointPayload): void;
  emit(type: 'GoalDrift', data: GoalDriftPayload): void;
  emit(type: 'SubAgentSpawn', data: SubAgentSpawnPayload): void;
  emit(type: 'ToolInvocation', data: ToolInvocationPayload): void;
  emit(type: BehavioralPrimitive, data: unknown): void {
    const payload: BehavioralPayload = { type, data } as BehavioralPayload;
    // Fire-and-forget: submit behavioral primitive to backend
    this.transport.submitBehavioralEvent(payload).catch((err) => { this.onError?.(err); });
  }

  async verify(executionId: string): Promise<VerificationProof> {
    const raw = await this.transport.verifyExecution(executionId) as VerificationProof & { anchoredAt?: string | Date };

    if (raw.anchoredAt && typeof raw.anchoredAt === 'string') {
      return {
        ...raw,
        anchoredAt: new Date(raw.anchoredAt),
      };
    }

    return raw;
  }

  clearSession(sessionId: string): void {
    this.sessionTrees.delete(sessionId);
    this.snapshots.delete(sessionId);
    this.lastHash.delete(sessionId);
    this.lastContextHash.delete(sessionId);
  }

  getDevTree(sessionId: string): TraceEvent[] {
    return this.sessionTrees.get(sessionId) ?? [];
  }

  printDevTree(sessionId: string): void {
    if (this.devOutput !== 'console' && this.devOutput !== 'both') return;
    const events = this.getDevTree(sessionId);
    if (events.length === 0) return;

    console.log(`\n[Invariance DEV] Execution trace: ${sessionId}`);
    for (const e of events) {
      const indent = '  '.repeat(e.metadata.depth);
      const status = e.error ? `ERROR: ${e.error}` : '✓';
      const anomaly = e.anomalyScore > 0.5 ? ` [ANOMALY ${e.anomalyScore.toFixed(2)}]` : '';
      console.log(`${indent}├── [${e.durationMs}ms] ${e.actionType}: ${e.agentId}${anomaly} ${status}`);
    }
    const totalMs = events.reduce((s, e) => s + e.durationMs, 0);
    const toolCalls = events.filter((e) => e.actionType === 'ToolInvocation').length;
    const anomalies = events.filter((e) => e.anomalyScore > 0.5).length;
    console.log(`└── Total: ${totalMs}ms | ${toolCalls} tool calls | ${anomalies} anomalies\n`);
  }

  captureSnapshot(sessionId: string, nodeId: string, snapshot: ReplaySnapshot): void {
    if (!this.snapshots.has(sessionId)) {
      this.snapshots.set(sessionId, new Map());
    }
    this.snapshots.get(sessionId)!.set(nodeId, snapshot);
    this.pruneSnapshots(sessionId);
  }

  getSnapshot(sessionId: string, nodeId: string): ReplaySnapshot | undefined {
    return this.snapshots.get(sessionId)?.get(nodeId);
  }

  private pruneSnapshots(sessionId: string): void {
    const sessionSnapshots = this.snapshots.get(sessionId);
    if (!sessionSnapshots) return;

    if (this.replayContext.type === 'full') return;

    const keep = this.replayContext.type === 'last' ? 1 : this.replayContext.size;
    if (sessionSnapshots.size <= keep) return;

    const sorted = [...sessionSnapshots.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.length - keep;
    for (let i = 0; i < toRemove; i++) {
      sessionSnapshots.delete(sorted[i]![0]);
    }
  }

  private shouldCapture(spanId: string, anomalyScore: number, hasError: boolean): boolean {
    if (hasError) {
      this.markHotPath(spanId);
      return true;
    }
    if (anomalyScore >= this.anomalyThreshold) {
      this.markHotPath(spanId);
      return true;
    }
    if (this.isHotPath(spanId)) {
      this.markHotPath(spanId);
      return true;
    }
    return this.rand() < this.sampleRate;
  }

  private submitEvent(event: TraceEvent): void {
    this.transport.submitTraceEvent(event).catch((err) => { this.onError?.(err); });
  }

  private trackDevTree(event: TraceEvent): void {
    const existing = this.sessionTrees.get(event.sessionId) ?? [];
    existing.push(event);
    // Cap session tree size — prune oldest events
    if (existing.length > this.maxSessionTreeSize) {
      existing.splice(0, existing.length - this.maxSessionTreeSize);
    }
    this.sessionTrees.set(event.sessionId, existing);
  }

  private markHotPath(spanId: string): void {
    if (this.hotPaths.size >= DEFAULT_HOT_PATH_MAX_SIZE) {
      this.pruneHotPaths();
    }
    this.hotPaths.set(spanId, this.now());
  }

  private isHotPath(spanId: string): boolean {
    const lastSeen = this.hotPaths.get(spanId);
    if (lastSeen === undefined) return false;

    if (this.now() - lastSeen > DEFAULT_HOT_PATH_TTL_MS) {
      this.hotPaths.delete(spanId);
      return false;
    }

    return true;
  }

  private pruneHotPaths(): void {
    const now = this.now();
    for (const [spanId, lastSeen] of this.hotPaths) {
      if (now - lastSeen > DEFAULT_HOT_PATH_TTL_MS) {
        this.hotPaths.delete(spanId);
      }
    }

    if (this.hotPaths.size < DEFAULT_HOT_PATH_MAX_SIZE) {
      return;
    }

    const overflow = this.hotPaths.size - DEFAULT_HOT_PATH_MAX_SIZE + 1;
    const oldestFirst = [...this.hotPaths.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < overflow; i++) {
      this.hotPaths.delete(oldestFirst[i]![0]);
    }
  }
}
