import type { Receipt, ReceiptQuery, SessionInfo, ErrorHandler, MonitorTriggerEvent, TraceQueryResult, ToolSchema, StatsResult, AgentNote } from './types.js';
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
  async queryNL(question: string, scope?: { session_id?: string; agent_id?: string; time_range?: { from: number; to: number } }): Promise<Record<string, unknown>> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, '/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, scope }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/query returned ${res.status}`);
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
