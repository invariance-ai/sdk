import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invariance } from '../client.js';

function mockFetch() {
  const calls: Array<{ url: string; opts: RequestInit; body?: unknown }> = [];
  const mock = vi.fn(async (url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : undefined;
    calls.push({ url, opts, body });

    // Session create
    if (url.includes('/v1/sessions') && opts.method === 'POST') {
      return { ok: true, json: async () => ({ id: body?.id, name: body?.name, created_by: body?.agent_id, status: 'open' }) };
    }
    // Trace events
    if (url.includes('/v1/trace/events')) {
      return { ok: true, json: async () => ({ nodes: body?.map((_: unknown, i: number) => ({ id: `node-${i}` })) ?? [] }) };
    }
    // Session close
    if (url.includes('/v1/sessions/') && opts.method === 'PATCH') {
      return { ok: true, json: async () => ({ id: 'sess', status: 'closed' }) };
    }
    // Receipts batch
    if (url.includes('/v1/receipts')) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', mock);
  return { mock, calls };
}

describe('Run abstraction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('start() creates a session and returns a Run', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });

    const run = await inv.run.start({ name: 'test-run' });
    expect(run.agent).toBe('test-agent');
    expect(run.name).toBe('test-run');
    expect(run.sessionId).toBeTruthy();

    // Should have created a session
    const sessionCall = calls.find(c => c.url.includes('/v1/sessions') && c.opts.method === 'POST');
    expect(sessionCall).toBeTruthy();
    expect(sessionCall!.body).toMatchObject({ name: 'test-run', agent_id: 'test-agent' });

    await inv.shutdown();
  });

  it('start() throws if no agent provided', async () => {
    mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.run.start({ name: 'test-run' })).rejects.toThrow('agent is required');
    await inv.shutdown();
  });

  it('step() emits a trace_step event', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    const result = await run.step('lookup', async () => {
      return { found: true };
    });

    expect(result).toEqual({ found: true });

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    expect(traceCall).toBeTruthy();
    const event = traceCall!.body[0];
    expect(event.action_type).toBe('trace_step');
    expect(event.input).toEqual({ step: 'lookup' });
    expect(event.session_id).toBe(run.sessionId);
    expect(event.agent_id).toBe('test-agent');
    expect(event.duration_ms).toBeGreaterThanOrEqual(0);

    await inv.shutdown();
  });

  it('tool() emits a tool_invocation event', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    const result = await run.tool('fetch_order', { orderId: '123' }, async () => {
      return { status: 'shipped' };
    });

    expect(result).toEqual({ status: 'shipped' });

    const traceCalls = calls.filter(c => c.url.includes('/v1/trace/events'));
    const event = traceCalls[0]!.body[0];
    expect(event.action_type).toBe('tool_invocation');
    expect(event.input).toMatchObject({ tool: 'fetch_order', args: { orderId: '123' } });

    await inv.shutdown();
  });

  it('nested step/tool produces correct parent-child structure', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.step('outer', async () => {
      await run.tool('inner_tool', {}, async () => 'done');
    });

    const traceCalls = calls.filter(c => c.url.includes('/v1/trace/events'));
    // inner_tool should have parent_id set to outer's span_id
    const innerEvent = traceCalls[0]!.body[0]; // inner emits first (before outer completes)
    const outerEvent = traceCalls[1]!.body[0];

    expect(innerEvent.parent_id).toBe(outerEvent.span_id);

    await inv.shutdown();
  });

  it('context() emits a context event', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.context('raw prompt', 'Hello, how can I help?');

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    const event = traceCall!.body[0];
    expect(event.action_type).toBe('context');
    expect(event.input).toEqual({ label: 'raw prompt' });
    expect(event.output).toEqual({ value: 'Hello, how can I help?' });

    await inv.shutdown();
  });

  it('finish() returns a summary', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.step('a', async () => 'done');
    await run.context('note', 'test');
    const summary = await run.finish();

    expect(summary.session_id).toBe(run.sessionId);
    expect(summary.event_count).toBe(2);
    expect(summary.receipt_count).toBe(0); // no provenance
    expect(summary.status).toBe('closed');
    expect(summary.duration_ms).toBeGreaterThanOrEqual(0);
    expect(calls.some(c => c.url.includes(`/v1/sessions/${run.sessionId}`) && c.opts.method === 'PATCH')).toBe(true);

    await inv.shutdown();
  });

  it('finish() throws on double-finish', async () => {
    mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });
    await run.finish();
    await expect(run.finish()).rejects.toThrow('already finished');
    await inv.shutdown();
  });

  it('step() captures errors in trace events', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await expect(
      run.step('failing', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    const event = traceCall!.body[0];
    expect(event.action_type).toBe('trace_step');
    expect(event.error).toBe('boom');

    await inv.shutdown();
  });

  it('does not emit trace events when traces are disabled', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({
      apiKey: 'inv_test',
      agent: 'test-agent',
      instrumentation: { traces: false },
    });
    const run = await inv.run.start({ name: 'test-run' });

    await run.step('lookup', async () => ({ found: true }));
    const summary = await run.finish();

    expect(calls.some(c => c.url.includes('/v1/trace/events'))).toBe(false);
    expect(summary.event_count).toBe(0);

    await inv.shutdown();
  });

  it('log() emits a trace_step event with label and data', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.log('decision context', { reason: 'customer eligible' });

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    const event = traceCall!.body[0];
    expect(event.action_type).toBe('trace_step');
    expect(event.input).toEqual({ label: 'decision context' });
    expect(event.output).toEqual({ reason: 'customer eligible' });

    await inv.shutdown();
  });

  it('log() works with no data', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.log('checkpoint reached');

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    const event = traceCall!.body[0];
    expect(event.input).toEqual({ label: 'checkpoint reached' });
    expect(event.output).toBeUndefined();

    await inv.shutdown();
  });

  it('log() wraps non-object data', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.log('score', 42);

    const traceCall = calls.find(c => c.url.includes('/v1/trace/events'));
    const event = traceCall!.body[0];
    expect(event.output).toEqual({ value: 42 });

    await inv.shutdown();
  });

  it('fail() emits error event and closes with failed status', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    const summary = await run.fail(new Error('something broke'));

    expect(summary.status).toBe('failed');
    expect(summary.session_id).toBe(run.sessionId);

    const traceCalls = calls.filter(c => c.url.includes('/v1/trace/events'));
    const errorEvent = traceCalls[0]!.body[0];
    expect(errorEvent.action_type).toBe('trace_step');
    expect(errorEvent.input).toEqual({ step: '__run_failed' });
    expect(errorEvent.error).toBe('something broke');

    // Should have closed the session
    expect(calls.some(c => c.url.includes(`/v1/sessions/${run.sessionId}`) && c.opts.method === 'PATCH')).toBe(true);

    await inv.shutdown();
  });

  it('fail() prevents further operations', async () => {
    mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });
    await run.fail('error');
    await expect(run.step('a', async () => 'b')).rejects.toThrow('already finished');
    await inv.shutdown();
  });

  it('cancel() closes with cancelled status', async () => {
    mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    const summary = await run.cancel('user requested');
    expect(summary.status).toBe('cancelled');

    await inv.shutdown();
  });

  it('cancel() emits reason event when reason provided', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.cancel('timeout');

    const traceCalls = calls.filter(c => c.url.includes('/v1/trace/events'));
    const cancelEvent = traceCalls[0]!.body[0];
    expect(cancelEvent.input).toEqual({ step: '__run_cancelled' });
    expect(cancelEvent.output).toEqual({ reason: 'timeout' });

    await inv.shutdown();
  });

  it('cancel() without reason does not emit trace event', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({ apiKey: 'inv_test', agent: 'test-agent' });
    const run = await inv.run.start({ name: 'test-run' });

    await run.cancel();

    const traceCalls = calls.filter(c => c.url.includes('/v1/trace/events'));
    expect(traceCalls).toHaveLength(0);

    await inv.shutdown();
  });

  it('does not create the same session twice when provenance is enabled', async () => {
    const { calls } = mockFetch();
    const inv = Invariance.init({
      apiKey: 'inv_test',
      agent: 'test-agent',
      privateKey: 'a'.repeat(64),
      instrumentation: { provenance: true },
    });

    const run = await inv.run.start({ name: 'test-run' });
    await run.finish();

    const sessionCreates = calls.filter(c => c.url.includes('/v1/sessions') && c.opts.method === 'POST');
    expect(sessionCreates).toHaveLength(1);

    await inv.shutdown();
  });
});
