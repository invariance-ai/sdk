import type { MonitorsResource } from './resources/monitors.js';
import type { MonitorSignal } from './types/monitor.js';

/**
 * Polls for new monitor events on an interval.
 * Used internally by the Invariance client when onMonitorTrigger is configured.
 */
export class MonitorPoller {
  private readonly monitors: MonitorsResource;
  private readonly intervalMs: number;
  private readonly onEvent: (event: MonitorSignal) => void | Promise<void>;
  private readonly onError?: (err: unknown) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeenEventId: string | undefined;
  private polling = false;

  constructor(opts: {
    monitors: MonitorsResource;
    intervalMs: number;
    onEvent: (event: MonitorSignal) => void | Promise<void>;
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
      const { events, next_cursor } = await this.monitors.listEvents({
        after_id: this.lastSeenEventId,
        acknowledged: false,
      });
      for (const event of events) {
        await this.onEvent(event);
      }
      if (events.length > 0) {
        this.lastSeenEventId = next_cursor ?? events[events.length - 1]?.id;
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    } finally {
      this.polling = false;
    }
  }
}
