import type { MonitorsResource } from './resources/monitors.js';
import type { MonitorSignal } from './types/monitor.js';

/**
 * Polls for new monitor events on an interval.
 * Used internally by the Invariance client when onMonitorTrigger is configured.
 */
export class MonitorPoller {
  private readonly monitors: MonitorsResource;
  private readonly intervalMs: number;
  private readonly onEvent: (event: MonitorSignal) => void;
  private readonly onError?: (err: unknown) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeenEventId: string | undefined;
  private polling = false;

  constructor(opts: {
    monitors: MonitorsResource;
    intervalMs: number;
    onEvent: (event: MonitorSignal) => void;
    onError?: (err: unknown) => void;
  }) {
    this.monitors = opts.monitors;
    this.intervalMs = opts.intervalMs;
    this.onEvent = opts.onEvent;
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

  /** Run a single poll cycle. Prevents overlapping polls. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const { events } = await this.monitors.listEvents({
        after_id: this.lastSeenEventId,
        acknowledged: false,
      });
      for (const event of events) {
        this.lastSeenEventId = event.id;
        this.onEvent(event);
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    } finally {
      this.polling = false;
    }
  }
}
