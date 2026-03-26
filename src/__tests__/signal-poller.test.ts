import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignalPoller } from '../signal-poller.js';
import type { SignalsResource } from '../resources/signals.js';
import type { Signal } from '../types/signal.js';

function mockSignal(id: string): Signal {
  return {
    id,
    source: 'emit',
    severity: 'low',
    owner_id: 'owner-1',
    monitor_id: null,
    trace_node_id: null,
    session_id: null,
    agent_id: null,
    title: 'Test signal',
    message: '',
    matched_value: null,
    metadata: {},
    acknowledged: false,
    acknowledged_at: null,
    acknowledged_by: null,
    created_at: new Date().toISOString(),
  };
}

describe('SignalPoller', () => {
  let signals: { list: ReturnType<typeof vi.fn> };
  let onSignal: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let poller: SignalPoller;

  beforeEach(() => {
    signals = {
      list: vi.fn().mockResolvedValue({ signals: [], next_cursor: null }),
    };
    onSignal = vi.fn();
    onError = vi.fn();
    poller = new SignalPoller({
      signals: signals as unknown as SignalsResource,
      intervalMs: 1000,
      onSignal,
      onError,
    });
  });

  afterEach(() => {
    poller.stop();
  });

  it('calls onSignal for each new signal', async () => {
    signals.list.mockResolvedValueOnce({
      signals: [mockSignal('sig-1'), mockSignal('sig-2')],
      next_cursor: null,
    });

    await poller.poll();

    expect(onSignal).toHaveBeenCalledTimes(2);
    expect(onSignal).toHaveBeenCalledWith(expect.objectContaining({ id: 'sig-1' }));
    expect(onSignal).toHaveBeenCalledWith(expect.objectContaining({ id: 'sig-2' }));
  });

  it('advances cursor from next_cursor when present', async () => {
    signals.list.mockResolvedValueOnce({
      signals: [mockSignal('sig-1')],
      next_cursor: 'sig-1-cursor',
    });

    await poller.poll();

    signals.list.mockResolvedValueOnce({
      signals: [mockSignal('sig-2')],
      next_cursor: null,
    });

    await poller.poll();

    expect(signals.list).toHaveBeenLastCalledWith({
      after_id: 'sig-1-cursor',
      acknowledged: false,
    });
  });

  it('falls back to the last signal id when next_cursor is missing', async () => {
    signals.list.mockResolvedValueOnce({
      signals: [mockSignal('sig-1'), mockSignal('sig-2')],
      next_cursor: null,
    });

    await poller.poll();

    signals.list.mockResolvedValueOnce({
      signals: [],
      next_cursor: null,
    });

    await poller.poll();

    expect(signals.list).toHaveBeenLastCalledWith({
      after_id: 'sig-2',
      acknowledged: false,
    });
  });

  it('awaits async signal handlers before advancing the cursor', async () => {
    const handled: string[] = [];
    onSignal.mockImplementation(async (signal: Signal) => {
      await Promise.resolve();
      handled.push(signal.id);
    });

    signals.list.mockResolvedValueOnce({
      signals: [mockSignal('sig-1')],
      next_cursor: 'sig-1-cursor',
    });

    await poller.poll();

    expect(handled).toEqual(['sig-1']);
    expect(signals.list).toHaveBeenCalledWith({
      after_id: undefined,
      acknowledged: false,
    });
  });

  it('calls onError on polling failure without crashing', async () => {
    signals.list.mockRejectedValueOnce(new Error('Network error'));

    await poller.poll();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('prevents overlapping polls', async () => {
    let resolveFirst: () => void;
    const firstPoll = new Promise<void>((resolve) => { resolveFirst = resolve; });

    signals.list.mockImplementationOnce(async () => {
      await firstPoll;
      return { signals: [mockSignal('sig-1')], next_cursor: null };
    });

    const poll1 = poller.poll();
    const poll2 = poller.poll();

    resolveFirst!();
    await poll1;
    await poll2;

    expect(signals.list).toHaveBeenCalledTimes(1);
  });
});
