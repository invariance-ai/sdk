import type { HttpClient } from './http.js';
import type { InvarianceError } from './errors.js';
import type { Receipt } from './types/receipt.js';

export interface BatcherConfig {
  http: HttpClient;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  onError?: (error: InvarianceError) => void;
}

export class Batcher {
  private queue: Receipt[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void>[] = [];
  private http: HttpClient;
  private flushIntervalMs: number;
  private maxBatchSize: number;
  private maxQueueSize: number;
  private onError?: (error: InvarianceError) => void;

  constructor(config: BatcherConfig) {
    this.http = config.http;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.maxBatchSize = config.maxBatchSize ?? 50;
    this.maxQueueSize = config.maxQueueSize ?? 1000;
    this.onError = config.onError;

    this.timer = setInterval(() => {
      if (this.queue.length > 0) this.flush();
    }, this.flushIntervalMs);

    // Don't prevent Node from exiting
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  enqueue(receipt: Receipt): void {
    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest receipts to make room
      const overflow = this.queue.length - this.maxQueueSize + 1;
      this.queue.splice(0, overflow);
      this.onError?.({
        name: 'InvarianceError',
        message: `Queue overflow: dropped ${overflow} receipts`,
        code: 'QUEUE_OVERFLOW',
      } as InvarianceError);
    }
    this.queue.push(receipt);

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  flush(): Promise<void> {
    if (this.queue.length === 0) return Promise.resolve();

    const batch = this.queue.splice(0, this.maxBatchSize);
    const promise = this.sendBatch(batch);
    this.pending.push(promise);
    promise.finally(() => {
      const idx = this.pending.indexOf(promise);
      if (idx !== -1) this.pending.splice(idx, 1);
    });
    return promise;
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Flush remaining
    if (this.queue.length > 0) {
      await this.flush();
    }

    // Await all pending
    await Promise.allSettled(this.pending);
  }

  private async sendBatch(batch: Receipt[]): Promise<void> {
    try {
      await this.http.post('/v1/receipts', { receipts: batch });
    } catch (err) {
      const error = err as InvarianceError;
      // Re-queue on 5xx (server error)
      if (error.statusCode && error.statusCode >= 500) {
        this.queue.unshift(...batch);
      }
      this.onError?.(error);
    }
  }
}
