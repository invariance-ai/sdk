import type { ErrorHandler, MonitorTriggerEvent } from './types.js';

export interface MonitorEventTransport {
  getMonitorEvents(afterId?: string, limit?: number): Promise<{
    events: MonitorTriggerEvent[];
    next_cursor: string | null;
    error?: boolean;
  }>;
}

export async function drainMonitorEvents(params: {
  transport: MonitorEventTransport;
  onMonitorTrigger: (event: MonitorTriggerEvent) => void;
  onError: ErrorHandler;
  initialCursor: string | null;
  pageLimit?: number;
  batchSize?: number;
}): Promise<{ success: boolean; lastSeenEventId: string | null }> {
  const { transport, onMonitorTrigger, onError, initialCursor } = params;
  const pageLimit = params.pageLimit ?? 50;
  const batchSize = params.batchSize ?? 200;

  let cursor = initialCursor ?? undefined;
  let lastSeenEventId = initialCursor;
  let success = false;

  for (let page = 0; page < pageLimit; page++) {
    const result = await transport.getMonitorEvents(cursor, batchSize);
    if (result.error) break;

    success = true;

    for (const event of result.events) {
      try {
        onMonitorTrigger(event);
      } catch (error) {
        onError(error);
      }
      lastSeenEventId = event.event_id;
    }

    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }

  return { success, lastSeenEventId };
}

export function nextMonitorPollInterval(params: {
  succeeded: boolean;
  currentIntervalMs: number;
  baseIntervalMs: number;
  maxIntervalMs: number;
}): number {
  if (params.succeeded) {
    return params.baseIntervalMs;
  }

  return Math.min(params.currentIntervalMs * 2, params.maxIntervalMs);
}
