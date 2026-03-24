import type {
  Receipt, ReceiptQuery, SessionInfo, ErrorHandler, MonitorTriggerEvent,
  TraceQueryResult, ToolSchema, StatsResult, AgentNote,
  Monitor, CreateMonitorBody, UpdateMonitorBody, MonitorEvaluateResult,
  EvalSuiteRemote, CreateEvalSuiteBody, EvalCase, CreateEvalCaseBody,
  EvalRun, RunEvalBody, EvalCompareResult,
  EvalThreshold, CreateEvalThresholdBody, UpdateEvalThresholdBody,
  FailureCluster, CreateFailureClusterBody, UpdateFailureClusterBody, FailureClusterMember, AddFailureClusterMemberBody,
  OptimizationSuggestion, CreateOptimizationSuggestionBody, UpdateOptimizationSuggestionBody,
  TrainingPair, CreateTrainingPairBody, TraceFlag, CreateTraceFlagBody, TraceFlagStats,
  DriftCatch, DriftComparison,
  TemplatePack, TemplateApplyResult,
  IdentityRecord,
  A2AConversation, A2AMessage, A2APeer,
  SearchResult,
} from './types.js';
import type { NLQueryRequest } from './query-types.js';
import { InvarianceError } from './errors.js';
import { fetchWithAuth } from './http.js';

import { isRecord, toCanonicalActionType, toSdkActionType, addAlias } from './normalize.js';

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
  private pendingRequests = new Set<Promise<void>>();
  private pendingSessionCloses = new Map<string, {
    status: string;
    closeHash: string;
    waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  }>();

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
      this.onError(new InvarianceError('QUEUE_OVERFLOW', `Queue overflow: dropped ${dropped} oldest receipt(s)`));
    }
    if (this.batch.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Force-flush all batched receipts to the API. */
  async flush(): Promise<void> {
    if (this.flushing) {
      await this.awaitPendingRequests();
      return;
    }

    if (this.batch.length === 0) {
      await this.awaitPendingRequests();
      return;
    }

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

    await this.awaitPendingRequests();
    await this.flushPendingSessionCloses();
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

    const data: unknown = await res.json();
    if (Array.isArray(data)) {
      return data as Receipt[];
    }
    if (
      typeof data === 'object' &&
      data !== null &&
      'receipts' in data &&
      Array.isArray((data as Record<string, unknown>).receipts)
    ) {
      return (data as { receipts: Receipt[] }).receipts;
    }
    throw new InvarianceError('API_ERROR', 'Unexpected response format from GET /v1/receipts');
  }

  /** Get session info from the API. */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/sessions/${encodedSessionId}`);

    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/sessions/${encodedSessionId} returned ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    if (data.receipt_count !== undefined && data.receiptCount === undefined) {
      data.receiptCount = data.receipt_count;
    }
    return data as unknown as SessionInfo;
  }

  async createSession(session: { id: string; name: string; agent: string }): Promise<void> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        name: session.name,
        agent_id: session.agent,
      }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/sessions returned ${res.status}`);
    }
  }

  async closeSession(sessionId: string, status: string, closeHash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = this.pendingSessionCloses.get(sessionId);
      const waiters = existing?.waiters ?? [];
      waiters.push({ resolve, reject });
      this.pendingSessionCloses.set(sessionId, { status, closeHash, waiters });
      void this.flushPendingSessionClosesIfIdle();
    });
  }

  /** Submit a trace event to the observability API. */
  async submitTraceEvent(event: unknown): Promise<void> {
    const payload = normalizeTraceEventPayload(event);
    return this.trackPending((async () => {
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
    })());
  }

  /** Submit a behavioral primitive event. */
  async submitBehavioralEvent(payload: unknown): Promise<void> {
    const normalizedPayload = normalizeBehavioralPayload(payload);
    return this.trackPending((async () => {
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
    })());
  }

  /** Verify an execution via the hosted verification API. */
  async verifyExecution(executionId: string): Promise<Record<string, unknown>> {
    const encodedId = encodeURIComponent(executionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/verify/${encodedId}`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/verify/${encodedId} returned ${res.status}`);
    }
    return await res.json() as Record<string, unknown>;
  }

  /** Query the semantic behavior graph. */
  async queryGraph(query: string): Promise<Record<string, unknown>> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/trace/graph/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/trace/graph/query returned ${res.status}`);
    }
    return await res.json() as Record<string, unknown>;
  }

  /** Get replay timeline for a session */
  async getReplayTimeline(sessionId: string): Promise<Record<string, unknown>> {
    const encodedId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/sessions/${encodedId}/replay`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/sessions/${encodedId}/replay returned ${res.status}`);
    }
    const data = await res.json();
    return normalizeReplayTimelineResponse(data) as Record<string, unknown>;
  }

  /** Get snapshot for a specific node */
  async getNodeSnapshot(nodeId: string): Promise<Record<string, unknown>> {
    const encodedId = encodeURIComponent(nodeId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/nodes/${encodedId}/snapshot`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/nodes/${encodedId}/snapshot returned ${res.status}`);
    }
    const data = await res.json();
    return normalizeNodeSnapshotResponse(data) as Record<string, unknown>;
  }

  /** Submit a counterfactual replay request */
  async submitCounterfactual(request: unknown): Promise<Record<string, unknown>> {
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
    return normalizeCounterfactualResponse(data) as Record<string, unknown>;
  }

  // -- Contract / Settlement endpoints --

  async proposeContract(body: {
    providerId: string;
    terms: Record<string, unknown>;
    termsHash: string;
    signature: string;
  }): Promise<{ id: string; sessionId: string; status: string }> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts returned ${res.status}`);
    return res.json() as Promise<{ id: string; sessionId: string; status: string }>;
  }

  async acceptContract(contractId: string, signature: string): Promise<{ id: string; status: string }> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature }),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts/${id}/accept returned ${res.status}`);
    return res.json() as Promise<{ id: string; status: string }>;
  }

  async submitDelivery(contractId: string, body: {
    outputData: Record<string, unknown>;
    outputHash: string;
    signature: string;
  }): Promise<{ id: string; status: string }> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts/${id}/deliver returned ${res.status}`);
    return res.json() as Promise<{ id: string; status: string }>;
  }

  async acceptDelivery(contractId: string, deliveryId: string, signature: string): Promise<{ id: string; status: string }> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}/accept-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryId, signature }),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts/${id}/accept-delivery returned ${res.status}`);
    return res.json() as Promise<{ id: string; status: string }>;
  }

  async settleContract(contractId: string): Promise<Record<string, unknown>> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts/${id}/settle returned ${res.status}`);
    return await res.json() as Record<string, unknown>;
  }

  async disputeContract(contractId: string, reason?: string): Promise<{ id: string; status: string }> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/contracts/${id}/dispute returned ${res.status}`);
    return res.json() as Promise<{ id: string; status: string }>;
  }

  async getContract(contractId: string): Promise<Record<string, unknown>> {
    const id = encodeURIComponent(contractId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/contracts/${id}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/contracts/${id} returned ${res.status}`);
    return await res.json() as Record<string, unknown>;
  }

  async listContracts(): Promise<Record<string, unknown>[]> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/contracts');
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/contracts returned ${res.status}`);
    return await res.json() as Record<string, unknown>[];
  }

  // -- Identity endpoints --

  async signup(body: { email: string; name: string; handle: string }): Promise<{
    handle: string; public_key: string; private_key: string; api_key: string;
  }> {
    const res = await fetch(`${this.apiUrl}/v1/identity/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/signup returned ${res.status}`);
    return res.json() as Promise<{ handle: string; public_key: string; private_key: string; api_key: string }>;
  }

  async createOrg(name: string): Promise<{
    name: string; public_key: string; private_key: string; api_key: string;
  }> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/identity/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/orgs returned ${res.status}`);
    return res.json() as Promise<{ name: string; public_key: string; private_key: string; api_key: string }>;
  }

  async registerAgent(owner: string, body: { name: string; public_key: string }): Promise<{
    owner: string; name: string; public_key: string; agent_id: string; created_at: string;
  }> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/identity/agents/${encodeURIComponent(owner)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/agents/${owner} returned ${res.status}`);
    return res.json() as Promise<{ owner: string; name: string; public_key: string; agent_id: string; created_at: string }>;
  }

  async lookupIdentity(owner: string, name: string): Promise<{
    owner: string; name: string; public_key: string; created_at: string;
  }> {
    const res = await fetch(`${this.apiUrl}/v1/identity/agents/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/agents/${owner}/${name} returned ${res.status}`);
    return res.json() as Promise<{ owner: string; name: string; public_key: string; created_at: string }>;
  }

  /** Poll monitor events from the backend */
  async getMonitorEvents(afterId?: string, limit?: number): Promise<{ events: MonitorTriggerEvent[], next_cursor: string | null, error?: boolean }> {
    const params = new URLSearchParams();
    if (afterId) params.set('after_id', afterId);
    if (limit !== undefined) params.set('limit', String(limit));
    const query = params.toString();
    const path = query ? `/v1/monitors/events?${query}` : '/v1/monitors/events';

    try {
      const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
      if (!res.ok) {
        this.onError(new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`));
        return { events: [], next_cursor: null, error: true };
      }
      return await res.json() as { events: MonitorTriggerEvent[], next_cursor: string | null };
    } catch (error) {
      this.onError(error);
      return { events: [], next_cursor: null, error: true };
    }
  }

/** Get trace nodes for a session */
  async getSessionNodes(sessionId: string): Promise<Record<string, unknown>[]> {
    const encodedId = encodeURIComponent(sessionId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/trace/sessions/${encodedId}/nodes`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/trace/sessions/${encodedId}/nodes returned ${res.status}`);
    }
    const data = await res.json() as Record<string, unknown>;
    return (data.nodes ?? []) as Record<string, unknown>[];
  }

  /** Query the NL query endpoint */
  async queryNL(request: NLQueryRequest): Promise<Record<string, unknown>> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/nl-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/nl-query returned ${res.status}`);
    }
    return await res.json() as Record<string, unknown>;
  }

  // -- Query endpoints --

  /** Query traces using natural language */
  async queryTraces(
    query: string,
    opts?: { session_id?: string; agent_id?: string; limit?: number; llm?: boolean },
  ): Promise<TraceQueryResult> {
    try {
      const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/query/traces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...opts }),
      });
      if (!res.ok) {
        throw new InvarianceError('API_ERROR', `POST /v1/query/traces returned ${res.status}`);
      }
      return await res.json() as TraceQueryResult;
    } catch (error) {
      if (error instanceof InvarianceError) throw error;
      throw new InvarianceError('API_ERROR', `Query traces failed: ${String(error)}`);
    }
  }

  /** Query traces with a structured AST */
  async queryTracesStructured(ast: Record<string, unknown>): Promise<TraceQueryResult> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/query/traces/structured', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ast),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/query/traces/structured returned ${res.status}`);
    }
    return await res.json() as TraceQueryResult;
  }

  /** Get session or agent stats */
  async getStats(opts?: { session_id?: string; agent_id?: string }): Promise<StatsResult> {
    const params = new URLSearchParams();
    if (opts?.session_id) params.set('session_id', opts.session_id);
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    const qs = params.toString();
    const path = qs ? `/v1/query/stats?${qs}` : '/v1/query/stats';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    }
    return await res.json() as StatsResult;
  }

  /** Write an agent note */
  async writeNote(
    key: string,
    content: unknown,
    opts?: { session_id?: string; node_id?: string; ttl_hours?: number },
  ): Promise<AgentNote> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/query/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, content, ...opts }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/query/notes returned ${res.status}`);
    }
    return await res.json() as AgentNote;
  }

  /** Read an agent note by key */
  async readNote(key: string): Promise<AgentNote | null> {
    const encodedKey = encodeURIComponent(key);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/query/notes/${encodedKey}`);
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/query/notes/${encodedKey} returned ${res.status}`);
    }
    const result = await res.json() as { data: AgentNote | null };
    return result.data;
  }

  /** Get MCP tool schemas */
  async getToolSchemas(): Promise<ToolSchema[]> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/query/tools');
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/query/tools returned ${res.status}`);
    }
    const result = await res.json() as { tools: ToolSchema[] };
    return result.tools;
  }

  /** Raw fetch for SSE status endpoint */
  async connectStatusLive(): Promise<Response> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/status/live', {
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/status/live returned ${res.status}`);
    }
    return res;
  }

  // ── Monitors CRUD ──

  /** List all monitors, with optional status and agent_id filters */
  async listMonitors(opts?: { status?: string; agent_id?: string }): Promise<Monitor[]> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    const qs = params.toString();
    const path = qs ? `/v1/monitors?${qs}` : '/v1/monitors';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as Monitor[];
  }

  /** Create a new monitor from natural language */
  async createMonitor(body: CreateMonitorBody): Promise<Monitor> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/monitors returned ${res.status}`);
    return await res.json() as Monitor;
  }

  /** Get a single monitor by ID */
  async getMonitor(id: string): Promise<Monitor> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/monitors/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/monitors/${encodedId} returned ${res.status}`);
    return await res.json() as Monitor;
  }

  /** Update a monitor */
  async updateMonitor(id: string, body: UpdateMonitorBody): Promise<Monitor> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/monitors/${encodedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `PATCH /v1/monitors/${encodedId} returned ${res.status}`);
    return await res.json() as Monitor;
  }

  /** Delete a monitor */
  async deleteMonitor(id: string): Promise<{ ok: boolean }> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/monitors/${encodedId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `DELETE /v1/monitors/${encodedId} returned ${res.status}`);
    return await res.json() as { ok: boolean };
  }

  /** Manually evaluate a monitor against recent trace nodes */
  async evaluateMonitor(id: string): Promise<MonitorEvaluateResult> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/monitors/${encodedId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/monitors/${encodedId}/evaluate returned ${res.status}`);
    return await res.json() as MonitorEvaluateResult;
  }

  /** Acknowledge a monitor event */
  async acknowledgeMonitorEvent(eventId: string): Promise<Record<string, unknown>> {
    const encodedId = encodeURIComponent(eventId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/monitors/events/${encodedId}/acknowledge`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `PATCH /v1/monitors/events/${encodedId}/acknowledge returned ${res.status}`);
    return await res.json() as Record<string, unknown>;
  }

  // ── Evals ──

  /** List eval suites */
  async listEvalSuites(opts?: { agent_id?: string }): Promise<EvalSuiteRemote[]> {
    const params = new URLSearchParams();
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    const qs = params.toString();
    const path = qs ? `/v1/evals/suites?${qs}` : '/v1/evals/suites';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as EvalSuiteRemote[];
  }

  /** Create an eval suite */
  async createEvalSuite(body: CreateEvalSuiteBody): Promise<EvalSuiteRemote> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/evals/suites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/suites returned ${res.status}`);
    return await res.json() as EvalSuiteRemote;
  }

  /** Get a single eval suite */
  async getEvalSuite(id: string): Promise<EvalSuiteRemote> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suites/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/evals/suites/${encodedId} returned ${res.status}`);
    return await res.json() as EvalSuiteRemote;
  }

  /** List eval cases for a suite */
  async listEvalCases(suiteId: string): Promise<EvalCase[]> {
    const encodedId = encodeURIComponent(suiteId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suites/${encodedId}/cases`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/evals/suites/${encodedId}/cases returned ${res.status}`);
    return await res.json() as EvalCase[];
  }

  /** Create an eval case in a suite */
  async createEvalCase(suiteId: string, body: CreateEvalCaseBody): Promise<EvalCase> {
    const encodedId = encodeURIComponent(suiteId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suites/${encodedId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/suites/${encodedId}/cases returned ${res.status}`);
    return await res.json() as EvalCase;
  }

  /** Trigger an eval run for a suite */
  async runEval(suiteId: string, body: RunEvalBody): Promise<EvalRun> {
    const encodedId = encodeURIComponent(suiteId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suites/${encodedId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/suites/${encodedId}/run returned ${res.status}`);
    return await res.json() as EvalRun;
  }

  /** Get a single eval run with case results */
  async getEvalRun(runId: string): Promise<EvalRun> {
    const encodedId = encodeURIComponent(runId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/runs/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/evals/runs/${encodedId} returned ${res.status}`);
    return await res.json() as EvalRun;
  }

  /** List eval runs */
  async listEvalRuns(opts?: { suite_id?: string; agent_id?: string; status?: string; limit?: number }): Promise<EvalRun[]> {
    const params = new URLSearchParams();
    if (opts?.suite_id) params.set('suite_id', opts.suite_id);
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = qs ? `/v1/evals/runs?${qs}` : '/v1/evals/runs';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as EvalRun[];
  }

  /** Compare two eval runs within a suite */
  async compareEvalRuns(suiteId: string, runA: string, runB: string): Promise<EvalCompareResult> {
    const params = new URLSearchParams({ suite_id: suiteId, run_a: runA, run_b: runB });
    const path = `/v1/evals/compare?${params.toString()}`;
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as EvalCompareResult;
  }

  /** List eval thresholds */
  async listEvalThresholds(opts?: { suite_id?: string; metric?: string }): Promise<EvalThreshold[]> {
    const params = new URLSearchParams();
    if (opts?.suite_id) params.set('suite_id', opts.suite_id);
    if (opts?.metric) params.set('metric', opts.metric);
    const qs = params.toString();
    const path = qs ? `/v1/evals/thresholds?${qs}` : '/v1/evals/thresholds';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as EvalThreshold[];
  }

  /** Create an eval threshold */
  async createEvalThreshold(body: CreateEvalThresholdBody): Promise<EvalThreshold> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/evals/thresholds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/thresholds returned ${res.status}`);
    return await res.json() as EvalThreshold;
  }

  /** Update an eval threshold */
  async updateEvalThreshold(id: string, body: UpdateEvalThresholdBody): Promise<EvalThreshold> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/thresholds/${encodedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `PATCH /v1/evals/thresholds/${encodedId} returned ${res.status}`);
    return await res.json() as EvalThreshold;
  }

  /** Delete an eval threshold */
  async deleteEvalThreshold(id: string): Promise<{ ok: boolean }> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/thresholds/${encodedId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `DELETE /v1/evals/thresholds/${encodedId} returned ${res.status}`);
    return await res.json() as { ok: boolean };
  }

  /** List failure clusters */
  async listFailureClusters(opts?: { agent_id?: string; status?: string; cluster_type?: string }): Promise<FailureCluster[]> {
    const params = new URLSearchParams();
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.cluster_type) params.set('cluster_type', opts.cluster_type);
    const qs = params.toString();
    const path = qs ? `/v1/evals/clusters?${qs}` : '/v1/evals/clusters';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as FailureCluster[];
  }

  /** Get a failure cluster with members */
  async getFailureCluster(id: string): Promise<FailureCluster> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/clusters/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/evals/clusters/${encodedId} returned ${res.status}`);
    return await res.json() as FailureCluster;
  }

  /** Create a failure cluster */
  async createFailureCluster(body: CreateFailureClusterBody): Promise<FailureCluster> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/evals/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/clusters returned ${res.status}`);
    return await res.json() as FailureCluster;
  }

  /** Update a failure cluster */
  async updateFailureCluster(id: string, body: UpdateFailureClusterBody): Promise<FailureCluster> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/clusters/${encodedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `PATCH /v1/evals/clusters/${encodedId} returned ${res.status}`);
    return await res.json() as FailureCluster;
  }

  /** Add a member to a failure cluster */
  async addFailureClusterMember(id: string, body: AddFailureClusterMemberBody): Promise<FailureClusterMember> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/clusters/${encodedId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/clusters/${encodedId}/members returned ${res.status}`);
    return await res.json() as FailureClusterMember;
  }

  /** Delete a failure cluster */
  async deleteFailureCluster(id: string): Promise<{ ok: boolean }> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/clusters/${encodedId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `DELETE /v1/evals/clusters/${encodedId} returned ${res.status}`);
    return await res.json() as { ok: boolean };
  }

  /** List optimization suggestions */
  async listOptimizationSuggestions(opts?: {
    agent_id?: string;
    status?: string;
    suggestion_type?: string;
  }): Promise<OptimizationSuggestion[]> {
    const params = new URLSearchParams();
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.suggestion_type) params.set('suggestion_type', opts.suggestion_type);
    const qs = params.toString();
    const path = qs ? `/v1/evals/suggestions?${qs}` : '/v1/evals/suggestions';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as OptimizationSuggestion[];
  }

  /** Create an optimization suggestion */
  async createOptimizationSuggestion(body: CreateOptimizationSuggestionBody): Promise<OptimizationSuggestion> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/evals/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/evals/suggestions returned ${res.status}`);
    return await res.json() as OptimizationSuggestion;
  }

  /** Update an optimization suggestion */
  async updateOptimizationSuggestion(id: string, body: UpdateOptimizationSuggestionBody): Promise<OptimizationSuggestion> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suggestions/${encodedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `PATCH /v1/evals/suggestions/${encodedId} returned ${res.status}`);
    return await res.json() as OptimizationSuggestion;
  }

  /** Delete an optimization suggestion */
  async deleteOptimizationSuggestion(id: string): Promise<{ ok: boolean }> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/evals/suggestions/${encodedId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `DELETE /v1/evals/suggestions/${encodedId} returned ${res.status}`);
    return await res.json() as { ok: boolean };
  }

  // ── Training ──

  /** List training pairs */
  async listTrainingPairs(opts?: { status?: string }): Promise<TrainingPair[]> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    const qs = params.toString();
    const path = qs ? `/v1/training/pairs?${qs}` : '/v1/training/pairs';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as TrainingPair[];
  }

  /** Create a training pair */
  async createTrainingPair(body: CreateTrainingPairBody): Promise<TrainingPair> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/training/pairs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/training/pairs returned ${res.status}`);
    return await res.json() as TrainingPair;
  }

  /** Create a trace flag for training feedback */
  async createTraceFlag(body: CreateTraceFlagBody): Promise<TraceFlag> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/training/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/training/flags returned ${res.status}`);
    return await res.json() as TraceFlag;
  }

  /** List trace flags */
  async listTraceFlags(opts?: { session_id?: string; agent_id?: string; flag?: string; limit?: number; offset?: number }): Promise<TraceFlag[]> {
    const params = new URLSearchParams();
    if (opts?.session_id) params.set('session_id', opts.session_id);
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    if (opts?.flag) params.set('flag', opts.flag);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    const path = qs ? `/v1/training/flags?${qs}` : '/v1/training/flags';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as TraceFlag[];
  }

  /** Get aggregated trace flag statistics */
  async getTraceFlagStats(): Promise<TraceFlagStats> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/training/flags/stats');
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/training/flags/stats returned ${res.status}`);
    return await res.json() as TraceFlagStats;
  }

  // ── Drift ──

  /** Get drift catches (detected divergences between sessions) */
  async getDriftCatches(): Promise<DriftCatch[]> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/drift/catches');
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/drift/catches returned ${res.status}`);
    return await res.json() as DriftCatch[];
  }

  /** Get a detailed drift comparison between two sessions */
  async getDriftComparison(sessionA?: string, sessionB?: string): Promise<DriftComparison> {
    const params = new URLSearchParams();
    if (sessionA) params.set('session_a', sessionA);
    if (sessionB) params.set('session_b', sessionB);
    const qs = params.toString();
    const path = qs ? `/v1/drift/comparison?${qs}` : '/v1/drift/comparison';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as DriftComparison;
  }

  // ── Templates ──

  /** List available template packs */
  async listTemplatePacks(): Promise<TemplatePack[]> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/templates');
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/templates returned ${res.status}`);
    return await res.json() as TemplatePack[];
  }

  /** Apply a template pack, creating real monitors */
  async applyTemplatePack(id: string, body?: { agent_id?: string }): Promise<TemplateApplyResult> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/templates/${encodedId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new InvarianceError('API_ERROR', `POST /v1/templates/${encodedId}/apply returned ${res.status}`);
    return await res.json() as TemplateApplyResult;
  }

  // ── Identities ──

  /** List visible identity records */
  async listIdentities(): Promise<IdentityRecord[]> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/identities');
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/identities returned ${res.status}`);
    return await res.json() as IdentityRecord[];
  }

  /** Get a single identity record */
  async getIdentity(id: string): Promise<IdentityRecord> {
    const encodedId = encodeURIComponent(id);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/identities/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/identities/${encodedId} returned ${res.status}`);
    return await res.json() as IdentityRecord;
  }

  // ── A2A Query ──

  /** List A2A conversations */
  async listA2AConversations(opts?: { agent_id?: string }): Promise<A2AConversation[]> {
    const params = new URLSearchParams();
    if (opts?.agent_id) params.set('agent_id', opts.agent_id);
    const qs = params.toString();
    const path = qs ? `/v1/a2a/conversations?${qs}` : '/v1/a2a/conversations';
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as A2AConversation[];
  }

  /** Get a single A2A conversation */
  async getA2AConversation(conversationId: string): Promise<A2AConversation> {
    const encodedId = encodeURIComponent(conversationId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/a2a/conversations/${encodedId}`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/a2a/conversations/${encodedId} returned ${res.status}`);
    return await res.json() as A2AConversation;
  }

  /** Get messages for an A2A conversation */
  async getA2AConversationMessages(conversationId: string): Promise<A2AMessage[]> {
    const encodedId = encodeURIComponent(conversationId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/a2a/conversations/${encodedId}/messages`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/a2a/conversations/${encodedId}/messages returned ${res.status}`);
    return await res.json() as A2AMessage[];
  }

  /** Get peers for a specific agent */
  async getAgentPeers(agentId: string): Promise<A2APeer[]> {
    const encodedId = encodeURIComponent(agentId);
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/a2a/agents/${encodedId}/peers`);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET /v1/a2a/agents/${encodedId}/peers returned ${res.status}`);
    return await res.json() as A2APeer[];
  }

  // ── Search ──

  /** Search across sessions, agents, and anomalies */
  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    const path = `/v1/search?${params.toString()}`;
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
    if (!res.ok) throw new InvarianceError('API_ERROR', `GET ${path} returned ${res.status}`);
    return await res.json() as SearchResult[];
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
    await this.awaitPendingRequests();
    await this.flushPendingSessionCloses();
  }

  private trackPending<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      this.pendingRequests.delete(settled);
    });
    const settled = tracked.then(() => undefined, () => undefined);
    this.pendingRequests.add(settled);
    return tracked;
  }

  private async awaitPendingRequests(): Promise<void> {
    if (this.pendingRequests.size === 0) return;
    await Promise.allSettled([...this.pendingRequests]);
  }

  private async flushPendingSessionClosesIfIdle(): Promise<void> {
    if (this.flushing || this.batch.length > 0) return;
    await this.flushPendingSessionCloses();
  }

  private async flushPendingSessionCloses(): Promise<void> {
    if (this.pendingSessionCloses.size === 0) return;

    const entries = [...this.pendingSessionCloses.entries()];
    this.pendingSessionCloses.clear();

    for (const [sessionId, entry] of entries) {
      const encodedSessionId = encodeURIComponent(sessionId);
      try {
        const res = await fetchWithAuth(this.apiUrl, this.apiKey, `/v1/sessions/${encodedSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: entry.status, close_hash: entry.closeHash }),
        });
        if (!res.ok) {
          throw new InvarianceError('API_ERROR', `PATCH /v1/sessions/${encodedSessionId} returned ${res.status}`);
        }
        for (const waiter of entry.waiters) {
          waiter.resolve();
        }
      } catch (error) {
        for (const waiter of entry.waiters) {
          waiter.reject(error);
        }
      }
    }
  }
}
