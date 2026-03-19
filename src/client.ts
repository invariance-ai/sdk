import type { Action, InvarianceConfig, PolicyCheck, Receipt, ReceiptQuery, ContractTerms, AgentIdentity, MonitorTriggerEvent } from './types.js';
import { Session } from './session.js';
import { Transport } from './transport.js';
import { checkPolicies } from './policy.js';
import { InvarianceError } from './errors.js';
import { bytesToHex, sortedStringify, sha256, ed25519Sign } from './receipt.js';
import { deriveAgentKeypair } from './crypto.js';
import * as ed25519 from '@noble/ed25519';
import type { ActionMap, InputOf, OutputOf } from './templates.js';
import { InvarianceTracer } from './observability/tracer.js';
import type { TraceAction, TraceEvent, DecisionPointPayload, GoalDriftPayload, SubAgentSpawnPayload, ToolInvocationPayload, VerificationProof, BehavioralPrimitive, ReplaySnapshot, ReplayTimelineEntry, CounterfactualRequest, CounterfactualResult } from './observability/types.js';

declare const __SDK_VERSION__: string;

const DEFAULT_API_URL = process.env.INVARIANCE_API_URL || 'https://api.invariance.dev';
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 50;

function assertPrivateKey(privateKey: string): void {
  if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
    throw new InvarianceError('INIT_FAILED', 'privateKey must be a 32-byte hex string');
  }
}

/** Validate config and warn about mode-specific field mismatches. */
function validateConfig(config: InvarianceConfig): void {
  const mode = config.mode ?? 'PROD';
  if (mode === 'PROD') {
    if (config.devOutput) {
      console.warn('[Invariance] devOutput is ignored in PROD mode');
    }
  }
  if (mode === 'DEV') {
    if (config.sampleRate !== undefined) {
      console.warn('[Invariance] sampleRate is ignored in DEV mode (all events captured)');
    }
  }
}

type AgentOptions<TActions extends ActionMap> = {
  id: string;
  privateKey: string;
  actions?: TActions;
  allowActions?: ReadonlyArray<Extract<keyof TActions, string>>;
  denyActions?: ReadonlyArray<Extract<keyof TActions, string>>;
};

type AgentSession<TActions extends ActionMap> = {
  readonly id: string;
  readonly agent: string;
  readonly name: string;
  readonly actions?: TActions;
  record<K extends Extract<keyof TActions, string>>(
    action: K,
    input: InputOf<TActions[K]>,
    output?: OutputOf<TActions[K]>,
    error?: string,
  ): Promise<Receipt>;
  wrap<T>(
    action: Omit<Action, 'output' | 'error' | 'agent'> & { agent?: string },
    fn: () => T | Promise<T>,
  ): Promise<{ result: T; receipt: Receipt }>;
  end(status?: 'closed' | 'tampered'): ReturnType<Session['info']>;
  info(): ReturnType<Session['info']>;
};

/**
 * Main entry point for the Invariance SDK.
 *
 * @example
 * ```ts
 * const inv = Invariance.init({ apiKey: 'inv_...' });
 * const session = inv.session({ agent: 'swap-bot', name: 'morning-run' });
 * await session.record({ agent: 'swap-bot', action: 'swap', input: { from: 'ETH', to: 'USDC' } });
 * session.end();
 * await inv.shutdown();
 * ```
 */
export class Invariance {
  /** SDK version injected at build time */
  static readonly version: string = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0';

  private readonly config: Required<Pick<InvarianceConfig, 'apiKey' | 'apiUrl' | 'policies' | 'flushIntervalMs' | 'maxBatchSize' | 'onError' | 'privateKey'>>;
  private readonly transport: Transport;
  private monitorPollTimer: ReturnType<typeof setTimeout> | null = null;
  private monitorPolling = false;
  private lastSeenEventId: string | null = null;
  private readonly onMonitorTrigger?: (event: MonitorTriggerEvent) => void;
  private readonly monitorPollIntervalMs: number;
  private currentPollIntervalMs: number;
  private static readonly MAX_POLL_BACKOFF_MS = 300_000; // 5 minutes

  /** The observability tracer instance. Access directly for advanced usage. */
  readonly tracer: InvarianceTracer;

  private constructor(config: InvarianceConfig) {
    this.config = {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl ?? DEFAULT_API_URL,
      policies: config.policies ?? [],
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      onError: config.onError ?? console.error,
      privateKey: config.privateKey,
    };

    this.transport = new Transport(
      this.config.apiUrl,
      this.config.apiKey,
      this.config.flushIntervalMs,
      this.config.maxBatchSize,
      this.config.onError,
      config.maxQueueSize,
    );

    this.onMonitorTrigger = config.onMonitorTrigger;
    this.monitorPollIntervalMs = config.monitorPollIntervalMs ?? 30_000;
    this.currentPollIntervalMs = this.monitorPollIntervalMs;

    if (this.onMonitorTrigger) {
      this.schedulePoll();
    }

    this.tracer = new InvarianceTracer(this.transport, {
      mode: config.mode ?? 'PROD',
      sampleRate: config.sampleRate,
      anomalyThreshold: config.anomalyThreshold,
      devOutput: config.devOutput,
      onAnomaly: config.onAnomaly,
      replayContext: config.replayContext,
      captureReplaySnapshots: config.captureReplaySnapshots,
      onError: config.onError,
    });
  }

  /**
   * Initialize the Invariance SDK.
   *
   * @param config - SDK configuration (apiKey required)
   * @returns Configured Invariance instance
   */
  /**
   * Generate a new Ed25519 keypair for agent signing.
   */
  static generateKeypair(): { privateKey: string; publicKey: string } {
    const privKey = ed25519.utils.randomPrivateKey();
    const pubKey = ed25519.getPublicKey(privKey);
    return {
      privateKey: bytesToHex(privKey),
      publicKey: bytesToHex(pubKey),
    };
  }

  static init(config: InvarianceConfig): Invariance {
    if (!config.apiKey) {
      throw new InvarianceError('INIT_FAILED', 'apiKey is required');
    }
    if (!config.privateKey) {
      throw new InvarianceError('INIT_FAILED', 'privateKey is required');
    }
    assertPrivateKey(config.privateKey);
    validateConfig(config);
    return new Invariance(config);
  }

  /**
   * Record a single action outside any session (creates a one-off receipt).
   * For session-based recording with hash-chain context, use `session().record()` instead.
   *
   * @throws InvarianceError if agent is not specified
   */
  async record(action: Action): Promise<Receipt> {
    if (!action.agent) {
      throw new InvarianceError('API_ERROR', 'agent is required for one-off record(); use session() to default agent');
    }
    const session = await this.createSession({ agent: action.agent, name: '__single__' });
    try {
      return await session.record(action);
    } finally {
      session.end();
    }
  }

  /**
   * Create a new session for grouping related actions.
   */
  session(opts: { agent: string; name: string }): Session {
    return new Session(
      opts.agent,
      opts.name,
      this.config.privateKey,
      (receipt) => this.transport.enqueue(receipt),
      (session) => this.transport.createSession(session),
      (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
      this.config.onError,
    );
  }

  /**
   * Create a session and wait for backend initialization.
   * Use this when you want explicit failure if session creation fails.
   */
  async createSession(opts: { agent: string; name: string }): Promise<Session> {
    return Session.create(
      opts.agent,
      opts.name,
      this.config.privateKey,
      (receipt) => this.transport.enqueue(receipt),
      (session) => this.transport.createSession(session),
      (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
      this.config.onError,
    );
  }

  /**
   * Create an agent-scoped client with its own signing key and optional action policy.
   * This enables simple multi-agent setups under one account/application.
   */
  agent<TActions extends ActionMap>(opts: AgentOptions<TActions>): {
    readonly id: string;
    readonly actions?: TActions;
    session(input: { name: string }): AgentSession<TActions>;
    sessionAsync(input: { name: string }): Promise<AgentSession<TActions>>;
  } {
    if (!opts.id) {
      throw new InvarianceError('INIT_FAILED', 'agent id is required');
    }
    assertPrivateKey(opts.privateKey);

    const allowActions = new Set((opts.allowActions ?? []).map((x) => String(x)));
    const denyActions = new Set((opts.denyActions ?? []).map((x) => String(x)));
    const actions = opts.actions;

    const toAgentSession = (base: Session): AgentSession<TActions> => {
      return {
        id: base.id,
        agent: base.agent,
        name: base.name,
        actions,
        record: async (action, input, output, error) => {
          const actionName = String(action);
          if (denyActions.has(actionName)) {
            throw new InvarianceError('POLICY_DENIED', `Action "${actionName}" is denied for agent "${opts.id}"`);
          }
          if (allowActions.size > 0 && !allowActions.has(actionName)) {
            throw new InvarianceError('POLICY_DENIED', `Action "${actionName}" is not allowed for agent "${opts.id}"`);
          }

          return base.record({
            agent: opts.id,
            action: actionName,
            input: input as Record<string, unknown>,
            output: output as Record<string, unknown> | undefined,
            error,
          });
        },
        wrap: async <T>(action: Omit<Action, 'output' | 'error' | 'agent'> & { agent?: string }, fn: () => T | Promise<T>) => {
          return base.wrap({ ...action, agent: opts.id }, fn);
        },
        end: (status = 'closed') => base.end(status),
        info: () => base.info(),
      };
    };

    const createAgentSession = ({ name }: { name: string }): AgentSession<TActions> => {
      const base = new Session(
        opts.id,
        name,
        opts.privateKey,
        (receipt) => this.transport.enqueue(receipt),
        (session) => this.transport.createSession(session),
        (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
        this.config.onError,
      );
      return toAgentSession(base);
    };

    const createAgentSessionAsync = async ({ name }: { name: string }): Promise<AgentSession<TActions>> => {
      const base = await Session.create(
        opts.id,
        name,
        opts.privateKey,
        (receipt) => this.transport.enqueue(receipt),
        (session) => this.transport.createSession(session),
        (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
        this.config.onError,
      );
      return toAgentSession(base);
    };

    return {
      id: opts.id,
      actions,
      session: createAgentSession,
      sessionAsync: createAgentSessionAsync,
    };
  }

  /**
   * Policy check → execute → record — creates an auditable receipt.
   * Use this for actions that need policy enforcement and a tamper-evident audit trail.
   * For observability/debugging without receipts, use `trace()` instead.
   *
   * @throws InvarianceError with code POLICY_DENIED if policies deny the action
   */
  async wrap<T>(
    action: Omit<Action, 'output' | 'error'>,
    fn: () => T | Promise<T>,
  ): Promise<{ result: T; receipt: Receipt }> {
    const policyResult = this.check(action as Action);
    if (!policyResult.allowed) {
      throw new InvarianceError('POLICY_DENIED', policyResult.reason ?? 'Policy denied');
    }

    let output: Record<string, unknown> | undefined;
    let error: string | undefined;
    let result: T;

    try {
      result = await fn();
      output = typeof result === 'object' && result !== null
        ? result as Record<string, unknown>
        : { value: result };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const receipt = await this.record({ ...action, error });
      throw Object.assign(err instanceof Error ? err : new Error(error), { receipt });
    }

    const receipt = await this.record({ ...action, output });
    return { result, receipt };
  }

  /**
   * Trace an agent action for observability and debugging.
   * Captures timing, hashing, sampling, and anomaly detection — but does NOT create receipts.
   * For receipt-based audit trails, use `wrap()` instead.
   *
   * @example
   * ```ts
   * const { result } = await inv.trace({
   *   agentId: 'research-agent',
   *   action: { type: 'ToolInvocation', tool: 'web_search', input: query },
   *   fn: () => searchTool(query),
   * })
   * ```
   */
  async trace<T>(params: {
    agentId: string;
    action: TraceAction;
    sessionId?: string;
    spanId?: string;
    parentNodeId?: string;
    metadata?: { depth?: number; tokenCost?: number; toolCalls?: string[] };
    fn: () => T | Promise<T>;
  }): Promise<{ result: T; event: TraceEvent }> {
    const sessionId = params.sessionId ?? 'default';
    return this.tracer.trace({
      agentId: params.agentId,
      sessionId,
      action: params.action,
      spanId: params.spanId,
      parentNodeId: params.parentNodeId,
      metadata: params.metadata,
      fn: params.fn,
    });
  }

  /**
   * Emit a behavioral primitive event for the semantic graph.
   * Fire-and-forget, never blocks agent execution.
   */
  emit(type: 'DecisionPoint', data: DecisionPointPayload): void;
  emit(type: 'GoalDrift', data: GoalDriftPayload): void;
  emit(type: 'SubAgentSpawn', data: SubAgentSpawnPayload): void;
  emit(type: 'ToolInvocation', data: ToolInvocationPayload): void;
  emit(type: BehavioralPrimitive, data: unknown): void {
    switch (type) {
      case 'DecisionPoint':
        this.tracer.emit(type, data as DecisionPointPayload);
        return;
      case 'GoalDrift':
        this.tracer.emit(type, data as GoalDriftPayload);
        return;
      case 'SubAgentSpawn':
        this.tracer.emit(type, data as SubAgentSpawnPayload);
        return;
      case 'ToolInvocation':
        this.tracer.emit(type, data as ToolInvocationPayload);
        return;
    }
  }

  /**
   * Verify an execution via the hosted verification API.
   * Returns cryptographic proof of chain integrity.
   */
  async verify(executionId: string): Promise<VerificationProof> {
    return this.tracer.verify(executionId);
  }

  /**
   * Query the semantic behavior graph.
   * Agents can use this to check their own execution history programmatically.
   */
  async queryGraph(query: string): Promise<unknown> {
    return this.transport.queryGraph(query);
  }

  /**
   * Get the replay timeline for a session.
   */
  async replayTimeline(sessionId: string): Promise<ReplayTimelineEntry[]> {
    const data = await this.transport.getReplayTimeline(sessionId) as { timeline: ReplayTimelineEntry[] };
    return data.timeline;
  }

  /**
   * Get the full replay snapshot for a specific node.
   */
  async nodeSnapshot(nodeId: string): Promise<ReplaySnapshot | null> {
    const data = await this.transport.getNodeSnapshot(nodeId) as { snapshot: ReplaySnapshot | null };
    return data.snapshot;
  }

  /**
   * Submit a counterfactual replay request.
   */
  async counterfactual(request: CounterfactualRequest): Promise<CounterfactualResult> {
    return await this.transport.submitCounterfactual(request) as CounterfactualResult;
  }

  /**
   * Evaluate local policies against an action.
   */
  check(action: Action): PolicyCheck {
    return checkPolicies(this.config.policies, action);
  }

  /**
   * Query receipts from the Invariance API.
   */
  async query(filters: ReceiptQuery): Promise<Receipt[]> {
    return this.transport.queryReceipts(filters);
  }

  /**
   * Force-flush all batched receipts to the API.
   */
  /**
   * Check if the Invariance backend is reachable.
   */
  async healthCheck(): Promise<boolean> {
    return this.transport.healthCheck();
  }

  async flush(): Promise<void> {
    return this.transport.flush();
  }

  // ── Settlement Layer ──

  /**
   * Propose a contract to another agent.
   * Signs the terms hash with the SDK's private key.
   */
  async proposeContract(providerId: string, terms: ContractTerms): Promise<{ id: string; sessionId: string }> {
    const termsHash = await sha256(sortedStringify(terms));
    const signature = await ed25519Sign(termsHash, this.config.privateKey);
    return this.transport.proposeContract({ providerId, terms, termsHash, signature });
  }

  /**
   * Accept a contract (as provider). Counter-signs the terms hash.
   */
  async acceptContract(contractId: string, termsHash: string): Promise<{ id: string; status: string }> {
    const signature = await ed25519Sign(termsHash, this.config.privateKey);
    return this.transport.acceptContract(contractId, signature);
  }

  /**
   * Get a session wrapper that auto-attaches contract_id to every receipt.
   */
  contractSession(contractId: string, opts: { agent: string; name: string; sessionId: string }): Session {
    const session = new Session(
      opts.agent,
      opts.name,
      this.config.privateKey,
      (receipt) => {
        (receipt as Receipt & { contractId?: string }).contractId = contractId;
        this.transport.enqueue(receipt);
      },
      undefined, // session already exists on backend
      (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
      this.config.onError,
      opts.sessionId,
    );
    return session;
  }

  /**
   * Submit delivery proof (as provider). Signs the output hash.
   */
  async deliver(contractId: string, outputData: Record<string, unknown>): Promise<{ id: string; status: string }> {
    const outputHash = await sha256(sortedStringify(outputData));
    const signature = await ed25519Sign(outputHash, this.config.privateKey);
    return this.transport.submitDelivery(contractId, { outputData, outputHash, signature });
  }

  /**
   * Accept a delivery proof (as requestor). Signs the output hash.
   */
  async acceptDelivery(contractId: string, deliveryId: string, outputHash: string): Promise<{ id: string; status: string }> {
    const signature = await ed25519Sign(outputHash, this.config.privateKey);
    return this.transport.acceptDelivery(contractId, deliveryId, signature);
  }

  /**
   * Dispute a contract. Freezes the session.
   */
  async dispute(contractId: string, reason?: string): Promise<{ id: string; status: string }> {
    return this.transport.disputeContract(contractId, reason);
  }

  // ── Identity Registration ──

  /**
   * Register a named agent identity with the server.
   * Derives the keypair locally, sends only the public key.
   */
  async registerAgent(owner: string, name: string): Promise<{
    owner: string; name: string; public_key: string; agent_id: string; created_at: string;
  }> {
    const identity = `${owner}/${name}`;
    const { publicKey } = deriveAgentKeypair(this.config.privateKey, identity);
    return this.transport.registerAgent(owner, { name, public_key: publicKey });
  }

  /**
   * Look up a public agent identity (no auth required).
   */
  async lookupIdentity(owner: string, name: string): Promise<{
    owner: string; name: string; public_key: string; created_at: string;
  }> {
    return this.transport.lookupIdentity(owner, name);
  }

  // ── Identity System ──

  /**
   * Parse an identity string like "acme/compliance-agent" into its components.
   */
  static parseIdentity(identity: string): AgentIdentity {
    const slash = identity.indexOf('/');
    if (slash < 1 || slash === identity.length - 1) {
      throw new InvarianceError('INIT_FAILED', `Invalid identity format "${identity}". Expected "org/name".`);
    }
    return {
      org: identity.slice(0, slash),
      name: identity.slice(slash + 1),
      fullIdentity: identity,
    };
  }

  /**
   * Create an identity-bound wrapper around an agent function.
   * Derives a signing key from the configured private key for the given identity,
   * and attaches the identity to every emitted TraceNode.
   *
   * @param fn - The agent function to wrap
   * @param opts - Options including the identity string (e.g., "acme/compliance-agent")
   * @returns A wrapped function that records traces with identity + derived signature
   */
  wrapWithIdentity<T>(
    fn: () => T | Promise<T>,
    opts: {
      identity: string;
      action: string;
      input: Record<string, unknown>;
      sessionName?: string;
    },
  ): Promise<{ result: T; receipt: Receipt; identity: AgentIdentity }> {
    const parsedIdentity = Invariance.parseIdentity(opts.identity);
    const { privateKey: derivedPrivateKey } = deriveAgentKeypair(this.config.privateKey, opts.identity);

    return (async () => {
      const session = new Session(
        opts.identity,
        opts.sessionName ?? `${opts.identity}-session`,
        derivedPrivateKey,
        (receipt) => this.transport.enqueue(receipt),
        (session) => this.transport.createSession(session),
        (sessionId, status, closeHash) => this.transport.closeSession(sessionId, status, closeHash),
        this.config.onError,
      );

      await session.ready;

      let output: Record<string, unknown> | undefined;
      let error: string | undefined;
      let result: T;

      try {
        result = await fn();
        output = typeof result === 'object' && result !== null
          ? result as Record<string, unknown>
          : { value: result };
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        const receipt = await session.record({
          agent: opts.identity,
          action: opts.action,
          input: opts.input,
          error,
        });
        session.end();
        throw Object.assign(err instanceof Error ? err : new Error(error), { receipt });
      }

      const receipt = await session.record({
        agent: opts.identity,
        action: opts.action,
        input: opts.input,
        output,
      });
      session.end();

      return { result, receipt, identity: parsedIdentity };
    })();
  }

  /**
   * Derive a keypair for a named agent identity.
   * Convenience wrapper around deriveAgentKeypair using the SDK's configured private key.
   */
  deriveAgentKeypair(identity: string): { privateKey: string; publicKey: string } {
    return deriveAgentKeypair(this.config.privateKey, identity);
  }

  private schedulePoll(): void {
    this.monitorPollTimer = setTimeout(() => void this.pollMonitorEvents(), this.currentPollIntervalMs);
    if (typeof this.monitorPollTimer === 'object' && 'unref' in this.monitorPollTimer) {
      this.monitorPollTimer.unref();
    }
  }

  private async pollMonitorEvents(): Promise<void> {
    if (!this.onMonitorTrigger || this.monitorPolling) return;
    this.monitorPolling = true;

    let success = false;
    try {
      let cursor = this.lastSeenEventId ?? undefined;
      // Drain all pages (cap at 50 to prevent runaway loops)
      for (let page = 0; page < 50; page++) {
        const result = await this.transport.getMonitorEvents(cursor, 200);

        if (result.error) break;

        for (const event of result.events) {
          try {
            this.onMonitorTrigger(event);
          } catch (error) {
            this.config.onError(error);
          }
          this.lastSeenEventId = event.event_id;
        }

        success = true;

        if (!result.next_cursor) break;
        cursor = result.next_cursor;
      }
    } catch (err) {
      this.config.onError?.(err);
    } finally {
      this.monitorPolling = false;

      if (success) {
        // Reset to base interval on success
        this.currentPollIntervalMs = this.monitorPollIntervalMs;
      } else {
        // Double the interval on failure, capped at 5 minutes
        this.currentPollIntervalMs = Math.min(
          this.currentPollIntervalMs * 2,
          Invariance.MAX_POLL_BACKOFF_MS,
        );
      }

      // Schedule next poll (unless shutdown cleared the timer reference)
      if (this.monitorPollTimer !== null) {
        this.schedulePoll();
      }
    }
  }

  /**
   * Shut down the SDK: stop the flush timer and send remaining receipts.
   */
  async shutdown(): Promise<void> {
    if (this.monitorPollTimer) {
      clearTimeout(this.monitorPollTimer);
      this.monitorPollTimer = null;
    }
    return this.transport.shutdown();
  }
}
