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
} from './types.js';
import type { Transport } from '../transport.js';
import { sortedStringify, sha256 } from '../receipt.js';

const DEFAULT_SAMPLE_RATE = 0.01;
const DEFAULT_ANOMALY_THRESHOLD = 0.7;

export class InvarianceTracer {
  private readonly mode: TracerMode;
  private readonly sampleRate: number;
  private readonly anomalyThreshold: number;
  private readonly onAnomaly?: (node: TraceEvent) => void;
  private readonly transport: Transport;
  private readonly devOutput: 'ui' | 'console' | 'both';

  private hotPaths = new Map<string, number>(); // spanId -> last_seen
  private lastHash = new Map<string, string>(); // sessionId -> last hash
  private sessionTrees = new Map<string, TraceEvent[]>(); // DEV mode tree

  constructor(transport: Transport, config: TracerConfig) {
    this.mode = config.mode;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.anomalyThreshold = config.anomalyThreshold ?? DEFAULT_ANOMALY_THRESHOLD;
    this.onAnomaly = config.onAnomaly;
    this.transport = transport;
    this.devOutput = config.devOutput ?? 'console';
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
    const startTime = Date.now();
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
      Object.assign(err instanceof Error ? err : new Error(error), { traceEvent: event });
      throw err;
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
    const durationMs = Date.now() - startTime;
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

    if (this.mode === 'DEV' || this.shouldCapture(spanId, anomalyScore)) {
      await this.submitEvent(event);
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
    this.transport.submitBehavioralEvent(payload).catch(() => {});
  }

  async verify(executionId: string): Promise<unknown> {
    return this.transport.verifyExecution(executionId);
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

  private shouldCapture(spanId: string, anomalyScore: number): boolean {
    if (anomalyScore >= this.anomalyThreshold) {
      this.hotPaths.set(spanId, Date.now());
      return true;
    }
    if (this.hotPaths.has(spanId)) return true;
    return Math.random() < this.sampleRate;
  }

  private async submitEvent(event: TraceEvent): Promise<void> {
    this.transport.submitTraceEvent(event).catch(() => {});
  }

  private trackDevTree(event: TraceEvent): void {
    const existing = this.sessionTrees.get(event.sessionId) ?? [];
    existing.push(event);
    this.sessionTrees.set(event.sessionId, existing);
  }
}
