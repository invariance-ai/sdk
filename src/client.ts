import type { Action, InvarianceConfig, PolicyCheck, Receipt, ReceiptQuery } from './types.js';
import { Session } from './session.js';
import { Transport } from './transport.js';
import { checkPolicies } from './policy.js';
import { InvarianceError } from './errors.js';
import type { ActionMap, InputOf, OutputOf } from './templates.js';
import { InvarianceTracer } from './observability/tracer.js';
import type { TraceAction, TraceEvent, DecisionPointPayload, GoalDriftPayload, SubAgentSpawnPayload, ToolInvocationPayload, VerificationProof, BehavioralPrimitive } from './observability/types.js';

declare const __SDK_VERSION__: string;

const DEFAULT_API_URL = 'https://api.invariance.dev';
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 50;

function assertPrivateKey(privateKey: string): void {
  if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
    throw new InvarianceError('API_ERROR', 'privateKey must be a 32-byte hex string');
  }
}

type AgentOptions<TActions extends ActionMap> = {
  id: string;
  privateKey: string;
  actions?: TActions;
  allowActions?: ReadonlyArray<Extract<keyof TActions, string> | string>;
  denyActions?: ReadonlyArray<Extract<keyof TActions, string> | string>;
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
    );

    this.tracer = new InvarianceTracer(this.transport, {
      mode: config.mode ?? 'PROD',
      sampleRate: config.sampleRate,
      anomalyThreshold: config.anomalyThreshold,
      devOutput: config.devOutput,
      onAnomaly: config.onAnomaly,
    });
  }

  /**
   * Initialize the Invariance SDK.
   *
   * @param config - SDK configuration (apiKey required)
   * @returns Configured Invariance instance
   */
  static init(config: InvarianceConfig): Invariance {
    if (!config.apiKey) {
      throw new InvarianceError('API_ERROR', 'apiKey is required');
    }
    if (!config.privateKey) {
      throw new InvarianceError('API_ERROR', 'privateKey is required');
    }
    assertPrivateKey(config.privateKey);
    return new Invariance(config);
  }

  /**
   * Record a single action (creates a one-off receipt outside any session).
   */
  async record(action: Action): Promise<Receipt> {
    const session = this.session({ agent: action.agent, name: '__single__' });
    const receipt = await session.record(action);
    session.end();
    return receipt;
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
   * Create an agent-scoped client with its own signing key and optional action policy.
   * This enables simple multi-agent setups under one account/application.
   */
  agent<TActions extends ActionMap>(opts: AgentOptions<TActions>): {
    readonly id: string;
    readonly actions?: TActions;
    session(input: { name: string }): AgentSession<TActions>;
  } {
    if (!opts.id) {
      throw new InvarianceError('API_ERROR', 'agent id is required');
    }
    assertPrivateKey(opts.privateKey);

    const allowActions = new Set((opts.allowActions ?? []).map((x) => String(x)));
    const denyActions = new Set((opts.denyActions ?? []).map((x) => String(x)));
    const actions = opts.actions;

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
        end: (status = 'closed') => base.end(status),
        info: () => base.info(),
      };
    };

    return {
      id: opts.id,
      actions,
      session: createAgentSession,
    };
  }

  /**
   * Policy check → execute → record.
   * Checks local policies first, then runs the function, then records the result.
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
   * Trace an agent action with automatic timing, hashing, and sampling.
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
  async flush(): Promise<void> {
    return this.transport.flush();
  }

  /**
   * Shut down the SDK: stop the flush timer and send remaining receipts.
   */
  async shutdown(): Promise<void> {
    return this.transport.shutdown();
  }
}
