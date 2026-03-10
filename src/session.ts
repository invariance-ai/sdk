import { ulid } from 'ulid';
import type { Action, ErrorHandler, PolicyCheck, Receipt, SessionInfo, VerifyResult } from './types.js';
import { createReceipt, verifyChain } from './receipt.js';
import { InvarianceError } from './errors.js';

/** Callback to enqueue a receipt for flushing */
export type EnqueueFn = (receipt: Receipt) => void;

/** Callback to create a session on the API */
export type OnCreateSessionFn = (session: { id: string; name: string }) => Promise<void>;

/** Callback to close a session on the API */
export type OnCloseSessionFn = (sessionId: string, status: string, closeHash: string) => Promise<void>;

/**
 * A Session groups a sequence of hash-chained receipts for a single agent run.
 * Each receipt's hash links to the previous, forming a tamper-evident chain.
 */
export class Session {
  readonly id: string;
  readonly agent: string;
  readonly name: string;
  readonly ready: Promise<void>;
  private initializationError?: InvarianceError;
  private status: 'open' | 'closed' | 'tampered' = 'open';
  private previousHash = '0';
  private receipts: Receipt[] = [];
  private readonly privateKey: string;
  private readonly enqueue: EnqueueFn;
  private readonly onCloseSession?: OnCloseSessionFn;
  private readonly onError: ErrorHandler;

  private reportError(error: unknown): void {
    try {
      this.onError(error);
    } catch {
      // Never allow the error callback to crash lifecycle/background paths.
    }
  }

  constructor(
    agent: string,
    name: string,
    privateKey: string,
    enqueue: EnqueueFn,
    onCreateSession?: OnCreateSessionFn,
    onCloseSession?: OnCloseSessionFn,
    onError: ErrorHandler = () => {},
    existingSessionId?: string,
  ) {
    this.id = existingSessionId ?? ulid();
    this.agent = agent;
    this.name = name;
    this.privateKey = privateKey;
    this.enqueue = enqueue;
    this.onCloseSession = onCloseSession;
    this.onError = onError;

    this.ready = onCreateSession
      ? onCreateSession({ id: this.id, name: this.name }).catch((err) => {
          const normalizedError = err instanceof InvarianceError
            ? err
            : new InvarianceError(
                'SESSION_NOT_READY',
                `Failed to initialize session "${this.id}": ${err instanceof Error ? err.message : String(err)}`,
              );
          this.initializationError = normalizedError;
          this.reportError(normalizedError);
        })
      : Promise.resolve();
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
    if (this.initializationError) {
      throw this.initializationError;
    }
  }

  /**
   * Create a session that is guaranteed to be ready (initialized).
   * Prefer this over `new Session()` to avoid race conditions with the hidden `ready` promise.
   */
  static async create(
    agent: string,
    name: string,
    privateKey: string,
    enqueue: EnqueueFn,
    onCreateSession?: OnCreateSessionFn,
    onCloseSession?: OnCloseSessionFn,
    onError: ErrorHandler = () => {},
  ): Promise<Session> {
    const session = new Session(agent, name, privateKey, enqueue, onCreateSession, onCloseSession, onError);
    await session.ensureReady();
    return session;
  }

  /**
   * Record an action in this session.
   * Creates a hash-chained receipt and enqueues it for flushing.
   */
  async record(action: Action): Promise<Receipt> {
    await this.ensureReady();
    if (this.status !== 'open') {
      throw new InvarianceError('SESSION_CLOSED', `Session ${this.id} is ${this.status}, cannot record`);
    }
    // Default agent to session's agent if not provided
    if (!action.agent) {
      action = { ...action, agent: this.agent };
    }
    if (action.agent !== this.agent) {
      throw new InvarianceError('API_ERROR', `Action agent "${action.agent}" does not match session agent "${this.agent}"`);
    }

    let receipt;
    try {
      receipt = await createReceipt(
        {
          id: ulid(),
          sessionId: this.id,
          agent: action.agent,
          action: action.action,
          input: action.input,
          output: action.output,
          error: action.error,
          timestamp: Date.now(),
        },
        this.previousHash,
        this.privateKey,
      );
    } catch (err) {
      this.status = 'tampered';
      throw err;
    }

    this.previousHash = receipt.hash;
    this.enqueue(receipt);
    this.receipts.push(receipt);

    return receipt;
  }

  /**
   * End this session with a final status.
   */
  end(status: 'closed' | 'tampered' = 'closed'): SessionInfo {
    if (this.status !== 'open') {
      return this.info();
    }

    this.status = status;

    // Fire-and-forget session close
    this.onCloseSession?.(this.id, status, this.previousHash).catch((err) => {
      this.reportError(err);
    });

    return this.info();
  }

  /**
   * Policy check → execute → record within this session.
   */
  async wrap<T>(
    action: Omit<Action, 'output' | 'error'>,
    fn: () => T | Promise<T>,
    checkPolicies?: (action: Action) => PolicyCheck,
  ): Promise<{ result: T; receipt: Receipt }> {
    await this.ensureReady();

    const fullAction: Action = { ...action, agent: action.agent || this.agent };

    if (checkPolicies) {
      const policyResult = checkPolicies(fullAction);
      if (!policyResult.allowed) {
        throw new InvarianceError('POLICY_DENIED', policyResult.reason ?? 'Policy denied');
      }
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
      const receipt = await this.record({ ...fullAction, error });
      throw Object.assign(err instanceof Error ? err : new Error(error), { receipt });
    }

    const receipt = await this.record({ ...fullAction, output });
    return { result, receipt };
  }

  getReceipts(): readonly Receipt[] {
    return this.receipts.slice();
  }

  async verify(publicKeyHex?: string): Promise<VerifyResult> {
    return verifyChain(this.receipts, { publicKeyHex });
  }

  /** Get session info snapshot. */
  info(): SessionInfo {
    return {
      id: this.id,
      agent: this.agent,
      name: this.name,
      status: this.status,
      receiptCount: this.receipts.length,
    };
  }
}
