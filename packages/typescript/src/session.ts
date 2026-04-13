import { ulid } from 'ulid';
import { createReceipt } from './receipt.js';
import { InvarianceError } from './errors.js';
import type { Receipt } from './types/receipt.js';
import type { SessionInfo } from './types/session.js';
import type { Action } from './types/config.js';

export type EnqueueFn = (receipt: Receipt) => void;
export type SessionCreateFn = (opts: { id: string; name: string; agent_id?: string }) => Promise<void>;
export type SessionCloseFn = (id: string, status: 'closed' | 'tampered', closeHash: string) => Promise<void>;

export interface SessionOpts {
  agent: string;
  name: string;
  id?: string;
  privateKey?: string;
  enqueue: EnqueueFn;
  onCreate: SessionCreateFn;
  onClose: SessionCloseFn;
}

export class Session {
  readonly id: string;
  readonly agent: string;
  readonly name: string;
  readonly ready: Promise<void>;

  private previousHash = '0';
  private receipts: Receipt[] = [];
  private closed = false;
  private privateKey?: string;
  private enqueue: EnqueueFn;
  private onClose: SessionCloseFn;
  private readyResolve!: () => void;
  private readyReject!: (err: Error) => void;

  constructor(opts: SessionOpts) {
    this.id = opts.id ?? ulid();
    this.agent = opts.agent;
    this.name = opts.name;
    this.privateKey = opts.privateKey;
    this.enqueue = opts.enqueue;
    this.onClose = opts.onClose;

    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    // Fire session creation in background
    opts.onCreate({ id: this.id, name: this.name, agent_id: opts.agent })
      .then(() => this.readyResolve())
      .catch((err) => this.readyReject(err));
  }

  async record(action: Action): Promise<Receipt> {
    await this.ready;
    if (this.closed) throw new InvarianceError('SESSION_CLOSED', `Session ${this.id} is closed`);

    const receipt = await createReceipt({
      sessionId: this.id,
      agent: action.agent ?? this.agent,
      action: action.action,
      input: action.input,
      output: action.output,
      error: action.error,
      previousHash: this.previousHash,
      privateKey: this.privateKey,
    });

    this.previousHash = receipt.hash;
    this.receipts.push(receipt);
    this.enqueue(receipt);
    return receipt;
  }

  async wrap<T>(
    action: Omit<Action, 'output' | 'error'>,
    fn: () => T | Promise<T>,
  ): Promise<{ result: T; receipt: Receipt }> {
    let result: T;
    let error: string | undefined;
    let output: Record<string, unknown> | undefined;

    try {
      result = await fn();
      if (result !== null && result !== undefined && typeof result === 'object') {
        output = result as Record<string, unknown>;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const receipt = await this.record({ ...action, error });
      throw Object.assign(err instanceof Error ? err : new Error(error), { receipt });
    }

    const receipt = await this.record({ ...action, output, error });
    return { result, receipt };
  }

  async end(status: 'closed' | 'tampered' = 'closed'): Promise<SessionInfo> {
    if (this.closed) throw new InvarianceError('SESSION_CLOSED', `Session ${this.id} is already closed`);
    this.closed = true;
    const closeHash = this.previousHash;
    await this.onClose(this.id, status, closeHash);
    return this.info();
  }

  getReceipts(): readonly Receipt[] {
    return this.receipts;
  }

  info(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      agent: this.agent,
      status: this.closed ? 'closed' : 'open',
      receiptCount: this.receipts.length,
      rootHash: this.receipts.length > 0 ? this.receipts[0]!.hash : null,
      closeHash: this.closed ? this.previousHash : null,
    };
  }
}
