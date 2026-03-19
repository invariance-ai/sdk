import { describe, it, expect, vi, afterEach } from 'vitest';
import { InvarianceTracer } from '../observability/tracer.js';
import { Invariance } from '../client.js';
import { Transport } from '../transport.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

function makeTracer(overrides?: { onError?: (error: unknown) => void }) {
  // Use deferred promises so we control when rejection fires
  let rejectTrace!: (err: Error) => void;
  let rejectBehavioral!: (err: Error) => void;

  const tracePromise = new Promise<void>((_, reject) => { rejectTrace = reject; });
  const behavioralPromise = new Promise<void>((_, reject) => { rejectBehavioral = reject; });

  const transport = {
    submitTraceEvent: vi.fn().mockReturnValue(tracePromise),
    submitBehavioralEvent: vi.fn().mockReturnValue(behavioralPromise),
    verifyExecution: vi.fn().mockResolvedValue({
      valid: true,
      executionId: 'exec-1',
      chain: [],
      signedBy: 'invariance',
      anchored: false,
    }),
  };

  const onError = overrides?.onError ?? vi.fn();

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
    onError,
  });

  return { tracer, transport, onError, rejectTrace, rejectBehavioral };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tracer error routing', () => {
  it('emit() routes transport errors to onError', async () => {
    const onError = vi.fn();
    const { tracer, rejectBehavioral } = makeTracer({ onError });

    tracer.emit('DecisionPoint', {
      nodeId: 'node-1',
      candidates: ['a', 'b'],
      chosen: 'a',
      depth: 0,
    });

    // Reject the transport promise, then yield to microtask queue
    rejectBehavioral(new Error('transport down'));
    // Need to yield control to allow the .catch() microtask to execute
    await new Promise(setImmediate);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'transport down' }));
  });

  it('submitEvent routes transport errors to onError', async () => {
    const onError = vi.fn();
    const { tracer, rejectTrace } = makeTracer({ onError });

    // trace() in DEV mode always calls submitEvent
    await tracer.trace({
      sessionId: 'sess-1',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { q: 'x' } },
      fn: async () => 'ok',
    });

    // Reject the transport promise, then yield to microtask queue
    rejectTrace(new Error('transport down'));
    await new Promise(setImmediate);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'transport down' }));
  });

  it('does not throw when onError is not provided', async () => {
    const transport = {
      submitTraceEvent: vi.fn().mockRejectedValue(new Error('transport down')),
      submitBehavioralEvent: vi.fn().mockRejectedValue(new Error('transport down')),
      verifyExecution: vi.fn().mockResolvedValue({}),
    };

    const tracer = new InvarianceTracer(transport as unknown as Transport, {
      mode: 'DEV',
      // no onError — should silently swallow via optional chaining
    });

    tracer.emit('DecisionPoint', {
      nodeId: 'node-1',
      candidates: ['a'],
      chosen: 'a',
      depth: 0,
    });

    await tracer.trace({
      sessionId: 'sess-1',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: {} },
      fn: async () => 'ok',
    });

    // Should not throw — optional chaining means undefined.() is a no-op
    await new Promise(setImmediate);
  });
});

describe('pollMonitorEvents error routing', () => {
  it('routes fetch-level errors to onError', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('fetch', fetchMock);

    const onError = vi.fn();

    const inv = Invariance.init({
      apiKey: 'inv_test',
      privateKey: privKeyHex,
      onError,
      onMonitorTrigger: vi.fn(),
      monitorPollIntervalMs: 10,
    });

    await vi.advanceTimersByTimeAsync(10);

    // onError should have been called with the network failure
    expect(onError).toHaveBeenCalled();
    const errors = onError.mock.calls.map((c: unknown[]) => c[0]);
    const hasNetworkError = errors.some(
      (e: unknown) => e instanceof Error && e.message === 'network failure',
    );
    expect(hasNetworkError).toBe(true);

    await inv.shutdown();
    vi.useRealTimers();
  });
});
