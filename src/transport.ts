import type { Receipt, ReceiptQuery, SessionInfo, ErrorHandler } from './types.js';
import { InvarianceError } from './errors.js';

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

  private batch: Receipt[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    apiUrl: string,
    apiKey: string,
    flushIntervalMs: number,
    maxBatchSize: number,
    onError: ErrorHandler,
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBatchSize = maxBatchSize;
    this.onError = onError;

    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    // Allow Node.js to exit even if timer is running
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /** Add a receipt to the batch. Auto-flushes if batch is full. */
  enqueue(receipt: Receipt): void {
    this.batch.push(receipt);
    if (this.batch.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Force-flush all batched receipts to the API. */
  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const toSend = this.batch;
    this.batch = [];

    try {
      const res = await fetch(`${this.apiUrl}/v1/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ receipts: toSend }),
      });

      if (!res.ok) {
        throw new InvarianceError('FLUSH_FAILED', `POST /v1/receipts returned ${res.status}`);
      }
    } catch (error) {
      // Put receipts back for retry
      this.batch = toSend.concat(this.batch);
      this.onError(error);
    }
  }

  /** Query receipts from the API. */
  async queryReceipts(filters: ReceiptQuery): Promise<Receipt[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }

    const res = await fetch(`${this.apiUrl}/v1/receipts?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/receipts returned ${res.status}`);
    }

    const data = await res.json() as Receipt[] | { receipts: Receipt[] };
    if (Array.isArray(data)) return data;
    return data.receipts;
  }

  /** Get session info from the API. */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const res = await fetch(`${this.apiUrl}/v1/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `GET /v1/sessions/${sessionId} returned ${res.status}`);
    }

    return await res.json() as SessionInfo;
  }

  async createSession(session: { id: string; name: string }): Promise<void> {
    const res = await fetch(`${this.apiUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `POST /v1/sessions returned ${res.status}`);
    }
  }

  async closeSession(sessionId: string, status: string, closeHash: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/v1/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ status, close_hash: closeHash }),
    });
    if (!res.ok) {
      throw new InvarianceError('API_ERROR', `PATCH /v1/sessions/${sessionId} returned ${res.status}`);
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
