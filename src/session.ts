import { ulid } from 'ulid';
import type { Action, Receipt, SessionInfo } from './types.js';
import { createReceipt } from './receipt.js';

/** Callback to enqueue a receipt for flushing */
export type EnqueueFn = (receipt: Receipt) => void;

/**
 * A Session groups a sequence of hash-chained receipts for a single agent run.
 * Each receipt's hash links to the previous, forming a tamper-evident chain.
 */
export class Session {
  readonly id: string;
  readonly agent: string;
  readonly name: string;
  private status: 'active' | 'completed' | 'failed' = 'active';
  private previousHash = '0';
  private receiptCount = 0;
  private readonly signingKey: string;
  private readonly enqueue: EnqueueFn;

  constructor(agent: string, name: string, signingKey: string, enqueue: EnqueueFn) {
    this.id = ulid();
    this.agent = agent;
    this.name = name;
    this.signingKey = signingKey;
    this.enqueue = enqueue;
  }

  /**
   * Record an action in this session.
   * Creates a hash-chained receipt and enqueues it for flushing.
   */
  async record(action: Action): Promise<Receipt> {
    if (this.status !== 'active') {
      throw new Error(`Session ${this.id} is ${this.status}, cannot record`);
    }

    const receipt = await createReceipt(
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
      this.signingKey,
    );

    this.previousHash = receipt.hash;
    this.receiptCount++;
    this.enqueue(receipt);

    return receipt;
  }

  /**
   * End this session with a final status.
   */
  end(status: 'completed' | 'failed' = 'completed'): SessionInfo {
    this.status = status;
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
