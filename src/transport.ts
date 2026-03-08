import type { Receipt, ReceiptQuery, SessionInfo, ErrorHandler } from './types.js';
import { InvarianceError } from './errors.js';
import { fetchWithAuth } from './http.js';

const ACTION_TYPE_MAP: Record<string, string> = {
  DecisionPoint: 'decision_point',
  ToolInvocation: 'tool_invocation',
  SubAgentSpawn: 'sub_agent_spawn',
  GoalDrift: 'goal_drift',
  ConstraintCheck: 'constraint_check',
  PlanRevision: 'plan_revision',
  decision_point: 'decision_point',
  tool_invocation: 'tool_invocation',
  sub_agent_spawn: 'sub_agent_spawn',
  goal_drift: 'goal_drift',
  constraint_check: 'constraint_check',
  plan_revision: 'plan_revision',
};

const SDK_ACTION_TYPE_MAP: Record<string, string> = {
  decision_point: 'DecisionPoint',
  tool_invocation: 'ToolInvocation',
  sub_agent_spawn: 'SubAgentSpawn',
  goal_drift: 'GoalDrift',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCanonicalActionType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return ACTION_TYPE_MAP[value] ?? null;
}

function toSdkActionType(value: unknown): string | null {
  const canonical = toCanonicalActionType(value);
  if (!canonical) return null;
  return SDK_ACTION_TYPE_MAP[canonical] ?? null;
}

function addAlias(target: Record<string, unknown>, from: string, to: string): void {
  if (Object.prototype.hasOwnProperty.call(target, from) && !Object.prototype.hasOwnProperty.call(target, to)) {
    target[to] = target[from];
  }
}

function normalizeTraceEventPayload(event: unknown): unknown {
  if (!isRecord(event)) return event;

  const normalized: Record<string, unknown> = { ...event };
  addAlias(normalized, 'nodeId', 'node_id');
  addAlias(normalized, 'sessionId', 'session_id');
  addAlias(normalized, 'parentNodeId', 'parent_id');
  addAlias(normalized, 'spanId', 'span_id');
  addAlias(normalized, 'agentId', 'agent_id');
  addAlias(normalized, 'durationMs', 'duration_ms');
  addAlias(normalized, 'previousHash', 'previous_hash');
  addAlias(normalized, 'anomalyScore', 'anomaly_score');

  const canonical = toCanonicalActionType(normalized.action_type ?? normalized.actionType);
  if (canonical) {
    normalized.action_type = canonical;
  }

  return normalized;
}

function normalizeBehavioralPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  const canonical = toCanonicalActionType(normalized.type);
  if (canonical) {
    normalized.action_type = canonical;
  }

  if (isRecord(normalized.data)) {
    const data = { ...normalized.data };
    addAlias(data, 'nodeId', 'node_id');
    addAlias(data, 'parentNodeId', 'parent_node_id');
    addAlias(data, 'childAgentId', 'child_agent_id');
    addAlias(data, 'originalGoal', 'original_goal');
    addAlias(data, 'currentGoal', 'current_goal');
    addAlias(data, 'inputHash', 'input_hash');
    addAlias(data, 'outputHash', 'output_hash');
    addAlias(data, 'latencyMs', 'latency_ms');
    normalized.data = data;
  }

  return normalized;
}

function normalizeReplayTimelineEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;

  const normalized: Record<string, unknown> = { ...entry };
  addAlias(normalized, 'node_id', 'nodeId');
  addAlias(normalized, 'action_type', 'actionType');
  addAlias(normalized, 'duration_ms', 'durationMs');
  addAlias(normalized, 'context_hash', 'contextHash');
  addAlias(normalized, 'has_snapshot', 'hasSnapshot');
  addAlias(normalized, 'agent_id', 'agentId');

  const sdkActionType = toSdkActionType(normalized.actionType ?? normalized.action_type);
  if (sdkActionType) {
    normalized.actionType = sdkActionType;
  }

  return normalized;
}

function normalizeReplayTimelineResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  if (Array.isArray(normalized.timeline)) {
    normalized.timeline = normalized.timeline.map(normalizeReplayTimelineEntry);
  }

  return normalized;
}

function normalizeReplaySnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;

  const normalized: Record<string, unknown> = { ...snapshot };
  addAlias(normalized, 'node_id', 'nodeId');
  addAlias(normalized, 'session_id', 'sessionId');
  addAlias(normalized, 'llm_messages', 'llmMessages');
  addAlias(normalized, 'tool_results', 'toolResults');
  addAlias(normalized, 'rag_chunks', 'ragChunks');
  addAlias(normalized, 'external_reads', 'externalReads');

  return normalized;
}

function normalizeNodeSnapshotResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  if ('snapshot' in normalized) {
    normalized.snapshot = normalizeReplaySnapshot(normalized.snapshot);
  }

  return normalized;
}

function normalizeCounterfactualRequest(request: unknown): unknown {
  if (!isRecord(request)) return request;

  const normalized: Record<string, unknown> = { ...request };
  addAlias(normalized, 'branchFromNodeId', 'branch_from_node_id');
  addAlias(normalized, 'modifiedInput', 'modified_input');
  addAlias(normalized, 'modifiedActionType', 'modified_action_type');

  const canonical = toCanonicalActionType(normalized.modified_action_type ?? normalized.modifiedActionType);
  if (canonical) {
    normalized.modified_action_type = canonical;
  }

  return normalized;
}

function normalizeCounterfactualResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  addAlias(normalized, 'original_node_id', 'originalNodeId');
  addAlias(normalized, 'counterfactual_node_id', 'counterfactualNodeId');
  addAlias(normalized, 'branch_session_id', 'branchSessionId');

  return normalized;
}

/**
 * HTTP transport for the Invariance API.
 * Batches receipts and flushes them periodically or when the batch is full.
 */
export class Transport {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly onError: ErrorHandler;
  private readonly maxQueueSize: number;

  private batch: Receipt[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    apiUrl: string,
    apiKey: string,
    flushIntervalMs: number,
    maxBatchSize: number,
    onError: ErrorHandler,
    maxQueueSize?: number,
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBatchSize = maxBatchSize;
    this.onError = onError;
    this.maxQueueSize = maxQueueSize ?? 1000;

    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    // Allow Node.js to exit even if timer is running
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /** Add a receipt to the batch. Auto-flushes if batch is full. Drops oldest if queue overflows. */
  enqueue(receipt: Receipt): void {
    this.batch.push(receipt);
    if (this.batch.length > this.maxQueueSize) {
      const dropped = this.batch.length - this.maxQueueSize;
      this.batch = this.batch.slice(dropped);
      this.onError(new InvarianceError('FLUSH_FAILED', `Queue overflow: dropped ${dropped} oldest receipt(s)`));
    }
    if (this.batch.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Force-flush all batched receipts to the API. */
  async flush(): Promise<void> {
    if (this.batch.length === 0 || this.flushing) return;
    this.flushing = true;

    const toSend = this.batch;
    this.batch = [];

    try {
      const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts: toSend }),
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          // Client errors — don't retry, report and discard
          this.onError(new InvarianceError('API_ERROR', `POST /v1/receipts returned ${res.status}`));
          return;
        }
        throw new InvarianceError('FLUSH_FAILED', `POST /v1/receipts returned ${res.status}`);
      }
    } catch (error) {
      // Put receipts back for retry on network/5xx errors
      this.batch = toSend.concat(this.batch);
      this.onError(error);
    } finally {
      this.flushing = false;
    }
  }

  /** Query receipts from the API. */
  async queryReceipts(filters: ReceiptQuery): Promise<Receipt[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }

    const query = params.toString();
    const path = query ? `/v1/receipts?${query}` : '/v1/receipts';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);

    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/receipts returned ${res.status}`);
    }

    const data = await res.json() as Receipt[] | { receipts: Receipt[] };
    if (Array.isArray(data)) return data;
    return data.receipts;
  }

  /** Get session info from the API. */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/sessions/${encodedSessionId}`);

    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/sessions/${encodedSessionId} returned ${res.status}`);
    }

    return await res.json() as SessionInfo;
  }

  async createSession(session: { id: string; name: string }): Promise<void> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/sessions returned ${res.status}`);
    }
  }

  async closeSession(sessionId: string, status: string, closeHash: string): Promise<void> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/sessions/${encodedSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, close_hash: closeHash }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `PATCH /v1/sessions/${encodedSessionId} returned ${res.status}`);
    }
  }

  /** Submit a trace event to the observability API. */
  async submitTraceEvent(event: unknown): Promise<void> {
    const payload = normalizeTraceEventPayload(event);
    try {
      const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/trace/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.onError(new InvarianceError('API_ERROR', `POST /v1/trace/events returned ${res.status}`));
      }
    } catch (error) {
      this.onError(error);
    }
  }

  /** Submit a behavioral primitive event. */
  async submitBehavioralEvent(payload: unknown): Promise<void> {
    const normalizedPayload = normalizeBehavioralPayload(payload);
    try {
      const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/trace/behaviors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedPayload),
      });
      if (!res.ok) {
        this.onError(new InvarianceError('API_ERROR', `POST /v1/trace/behaviors returned ${res.status}`));
      }
    } catch (error) {
      this.onError(error);
    }
  }

  /** Verify an execution via the hosted verification API. */
  async verifyExecution(executionId: string): Promise<unknown> {
    const encodedId = encodeURIComponent(executionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/verify/${encodedId}`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/verify/${encodedId} returned ${res.status}`);
    }
    return res.json();
  }

  /** Query the semantic behavior graph. */
  async queryGraph(query: string): Promise<unknown> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/trace/graph/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/trace/graph/query returned ${res.status}`);
    }
    return res.json();
  }

  /** Get replay timeline for a session */
  async getReplayTimeline(sessionId: string): Promise<unknown> {
    const encodedId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/sessions/${encodedId}/replay`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/sessions/${encodedId}/replay returned ${res.status}`);
    }
    const data = await res.json();
    return normalizeReplayTimelineResponse(data);
  }

  /** Get snapshot for a specific node */
  async getNodeSnapshot(nodeId: string): Promise<unknown> {
    const encodedId = encodeURIComponent(nodeId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/nodes/${encodedId}/snapshot`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/nodes/${encodedId}/snapshot returned ${res.status}`);
    }
    const data = await res.json();
    return normalizeNodeSnapshotResponse(data);
  }

  /** Submit a counterfactual replay request */
  async submitCounterfactual(request: unknown): Promise<unknown> {
    const payload = normalizeCounterfactualRequest(request);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/trace/counterfactual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/trace/counterfactual returned ${res.status}`);
    }
    const data = await res.json();
    return normalizeCounterfactualResponse(data);
  }

  /** Check if the backend is reachable. */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/v1/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Stop the flush timer and send remaining receipts. */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
