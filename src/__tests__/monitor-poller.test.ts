import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitorPoller } from '../monitor-poller.js';
import type { MonitorsResource } from '../resources/monitors.js';
import type { MonitorSignal } from '../types/monitor.js';

function mockSignal(id: string): MonitorSignal {
  return {
    id,
    monitor_id: 'mon-1',
    monitor_name: 'Test Monitor',
    node_id: 'node-1',
    session_id: 'sess-1',
    agent_id: 'agent-1',
    severity: 'high',
    message: 'Test signal',
    acknowledged: false,
    created_at: new Date().toISOString(),
  };
}

describe('MonitorPoller', () => {
  let monitors: { listEvents: ReturnType<typeof vi.fn> };
  let onEvent: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let poller: MonitorPoller;

  beforeEach(() => {
    monitors = {
      listEvents: vi.fn().mockResolvedValue({ events: [], next_cursor: null }),
    };
    onEvent = vi.fn();
    onError = vi.fn();
    poller = new MonitorPoller({
      monitors: monitors as unknown as MonitorsResource,
      intervalMs: 1000,
      onEvent,
      onError,
    });
  });

  afterEach(() => {
    poller.stop();
  });

  it('calls onEvent for each new event', async () => {
    monitors.listEvents.mockResolvedValueOnce({
      events: [mockSignal('evt-1'), mockSignal('evt-2')],
      next_cursor: null,
    });

    await poller.poll();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-2' }));
  });

  it('advances cursor with after_id from last seen event', async () => {
    monitors.listEvents.mockResolvedValueOnce({
      events: [mockSignal('evt-1')],
      next_cursor: null,
    });

    await poller.poll();

    monitors.listEvents.mockResolvedValueOnce({
      events: [mockSignal('evt-2')],
      next_cursor: null,
    });

    await poller.poll();

    expect(monitors.listEvents).toHaveBeenLastCalledWith({
      after_id: 'evt-1',
      acknowledged: false,
    });
  });

  it('calls onError on polling failure without crashing', async () => {
    monitors.listEvents.mockRejectedValueOnce(new Error('Network error'));

    await poller.poll();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('prevents overlapping polls', async () => {
    let resolveFirst: () => void;
    const firstPoll = new Promise<void>((resolve) => { resolveFirst = resolve; });

    monitors.listEvents.mockImplementationOnce(async () => {
      await firstPoll;
      return { events: [mockSignal('evt-1')], next_cursor: null };
    });

    const poll1 = poller.poll();
    const poll2 = poller.poll(); // should be a no-op

    resolveFirst!();
    await poll1;
    await poll2;

    expect(monitors.listEvents).toHaveBeenCalledTimes(1);
  });

  it('does not call onEvent when no events returned', async () => {
    await poller.poll();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
