import type { LiveStatusEvent } from './query-types.js';
import type { ErrorHandler } from './types.js';
import { parseSSEChunk } from './sse-parser.js';
import { nextMonitorPollInterval } from './monitor-polling.js';

export interface LiveStatusClientConfig {
  apiUrl: string;
  apiKey: string;
  onEvent: (event: LiveStatusEvent) => void;
  onError?: ErrorHandler;
  eventTypes?: string[];
  baseIntervalMs?: number;
  maxIntervalMs?: number;
}

export class LiveStatusClient {
  private config: LiveStatusClientConfig;
  private controller: AbortController | null = null;
  private currentIntervalMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  constructor(config: LiveStatusClientConfig) {
    this.config = config;
    this.currentIntervalMs = config.baseIntervalMs ?? 1000;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.controller) return; // already connected
    this.doConnect();
  }

  disconnect(): void {
    this._connected = false;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async doConnect(): Promise<void> {
    this.controller = new AbortController();

    try {
      const res = await fetch(`${this.config.apiUrl}/v1/status/live`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'text/event-stream',
        },
        signal: this.controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed: ${res.status}`);
      }

      this._connected = true;
      this.currentIntervalMs = this.config.baseIntervalMs ?? 1000;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = parseSSEChunk(buffer);

        // Keep any partial frame at end of buffer
        const lastNewlineNewline = buffer.lastIndexOf('\n\n');
        buffer = lastNewlineNewline >= 0 ? buffer.slice(lastNewlineNewline + 2) : buffer;

        for (const frame of frames) {
          if (frame.event === 'ping') continue;
          if (!frame.data) continue;

          try {
            const event = JSON.parse(frame.data) as LiveStatusEvent;
            if (this.config.eventTypes && !this.config.eventTypes.includes(event.type)) continue;
            this.config.onEvent(event);
          } catch {
            // Skip malformed frames
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // intentional disconnect
      this.config.onError?.(err);
    } finally {
      this._connected = false;
      this.controller = null;
    }

    // Reconnect with backoff
    this.scheduleReconnect(false);
  }

  private scheduleReconnect(succeeded: boolean): void {
    if (this.reconnectTimer) return;

    this.currentIntervalMs = nextMonitorPollInterval({
      succeeded,
      currentIntervalMs: this.currentIntervalMs,
      baseIntervalMs: this.config.baseIntervalMs ?? 1000,
      maxIntervalMs: this.config.maxIntervalMs ?? 30000,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.currentIntervalMs);
  }
}
