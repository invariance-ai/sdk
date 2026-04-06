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
    mockFetch();
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
});
