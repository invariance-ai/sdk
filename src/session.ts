import { ulid } from 'ulid';
import type { Action, Receipt, SessionInfo } from './types.js';
import { createReceipt } from './receipt.js';

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
  private status: 'open' | 'closed' | 'tampered' = 'open';
  private previousHash = '0';
  private receiptCount = 0;
  private readonly privateKey: string;
  private readonly enqueue: EnqueueFn;
  private readonly onCloseSession?: OnCloseSessionFn;

  constructor(
    agent: string,
    name: string,
    privateKey: string,
    enqueue: EnqueueFn,
    onCreateSession?: OnCreateSessionFn,
    onCloseSession?: OnCloseSessionFn,
  ) {
    this.id = ulid();
    this.agent = agent;
    this.name = name;
    this.privateKey = privateKey;
    this.enqueue = enqueue;
    this.onCloseSession = onCloseSession;

    // Fire-and-forget session creation
    onCreateSession?.({ id: this.id, name: this.name }).catch(() => {});
  }

  /**
   * Record an action in this session.
   * Creates a hash-chained receipt and enqueues it for flushing.
   */
  async record(action: Action): Promise<Receipt> {
    if (this.status !== 'open') {
      throw new Error(`Session ${this.id} is ${this.status}, cannot record`);
    }
    if (action.agent !== this.agent) {
      throw new Error(`Action agent "${action.agent}" does not match session agent "${this.agent}"`);
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
    this.receiptCount++;
    this.enqueue(receipt);

    return receipt;
  }

  /**
   * End this session with a final status.
   */
  end(status: 'closed' | 'tampered' = 'closed'): SessionInfo {
    this.status = status;

    // Fire-and-forget session close
    this.onCloseSession?.(this.id, status, this.previousHash).catch(() => {});

    return this.info();
  }

  /** Get session info snapshot. */
  info(): SessionInfo {
    return {
      id: this.id,
      agent: this.agent,
      name: this.name,
      status: this.status,
      receiptCount: this.receiptCount,
    };
  }
}
