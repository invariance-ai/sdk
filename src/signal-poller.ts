import type { SignalsResource } from './resources/signals.js';
import type { Signal } from './types/signal.js';

export class SignalPoller {
  private readonly signals: SignalsResource;
  private readonly intervalMs: number;
  private readonly onSignal: (signal: Signal) => void | Promise<void>;
  private readonly onError?: (err: unknown) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeenSignalId: string | undefined;
  private polling = false;

  constructor(opts: {
    signals: SignalsResource;
    intervalMs: number;
    onSignal: (signal: Signal) => void | Promise<void>;
    onError?: (err: unknown) => void;
  }) {
    this.signals = opts.signals;
    this.intervalMs = opts.intervalMs;
    this.onSignal = opts.onSignal;
    this.onError = opts.onError;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const { signals } = await this.signals.list({
        after_id: this.lastSeenSignalId,
        acknowledged: false,
      });
      for (const signal of signals) {
        await this.onSignal(signal);
      }
      if (signals.length > 0) {
        // Always advance cursor to the newest signal (ULID lexicographic max)
        this.lastSeenSignalId = signals.reduce(
          (max, s) => (s.id > max ? s.id : max),
          signals[0]!.id,
        );
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    } finally {
      this.polling = false;
    }
  }
}
