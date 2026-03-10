/**
 * Integration tests against the demo backend.
 *
 * Run with:
 *   INVARIANCE_API_URL=https://demo-backend-production-1ff9.up.railway.app \
 *   INVARIANCE_API_KEY=inv_8417fb46c0f79dec84eb91ccf08e2ca20a0932ea9e4bdc7ec11cedff22914ffd \
 *   INVARIANCE_PRIVATE_KEY=28fb14d95e2ac3126d23b82497b0d4e8e4b04473a46015d939e9979fd84fce8e \
 *   pnpm vitest run src/__tests__/integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Invariance } from '../client.js';

const API_URL = process.env.INVARIANCE_API_URL;
const API_KEY = process.env.INVARIANCE_API_KEY;
const PRIVATE_KEY = process.env.INVARIANCE_PRIVATE_KEY;

const shouldRun = API_URL && API_KEY && PRIVATE_KEY;

describe.skipIf(!shouldRun)('Integration: demo backend', () => {
  let inv: Invariance;

  beforeAll(() => {
    inv = Invariance.init({
      apiUrl: API_URL!,
      apiKey: API_KEY!,
      privateKey: PRIVATE_KEY!,
      flushIntervalMs: 500,
    });
  });

  afterAll(async () => {
    await inv.shutdown();
  });

  it('health check', async () => {
    const ok = await inv.healthCheck();
    expect(ok).toBe(true);
  });

  it('full session lifecycle: create → record → verify → end', async () => {
    const session = await inv.createSession({
      agent: '01KKAKRQWACCSEVDEAW5G711ER',
      name: `integ-test-${Date.now()}`,
    });

    // Record a few actions
    const r1 = await session.record({
      agent: '01KKAKRQWACCSEVDEAW5G711ER',
      action: 'search',
      input: { query: 'integration test' },
      output: { results: ['a', 'b'] },
    });
    expect(r1.hash).toBeTruthy();
    expect(r1.previousHash).toBe('0');

    const r2 = await session.record({
      agent: '01KKAKRQWACCSEVDEAW5G711ER',
      action: 'analyze',
      input: { data: r1.hash },
      output: { score: 0.95 },
    });
    expect(r2.previousHash).toBe(r1.hash);

    // Verify chain locally
    const verification = await session.verify();
    expect(verification.valid).toBe(true);
    expect(verification.receiptCount).toBe(2);

    // Flush receipts to backend
    await inv.flush();

    const persistedReceipts = await inv.query({ sessionId: session.id });
    expect(persistedReceipts).toHaveLength(2);
    expect(persistedReceipts[0]?.previousHash).toBe('0');
    expect(persistedReceipts[1]?.previousHash).toBe(persistedReceipts[0]?.hash);
    expect(persistedReceipts.map((receipt) => receipt.action)).toEqual(['search', 'analyze']);

    // End session
    const info = await session.end();
    expect(info.status).toBe('closed');
  });

  it('wrap() records action with output', async () => {
    const session = await inv.createSession({
      agent: '01KKAKRQWACCSEVDEAW5G711ER',
      name: `integ-wrap-${Date.now()}`,
    });

    const { result, receipt } = await session.wrap(
      { action: 'compute', input: { x: 42 } },
      () => ({ answer: 1764 }),
    );

    expect(result).toEqual({ answer: 1764 });
    expect(receipt.action).toBe('compute');
    expect(receipt.output).toEqual({ answer: 1764 });

    await inv.flush();
    const persistedReceipts = await inv.query({ sessionId: session.id });
    expect(persistedReceipts).toHaveLength(1);
    expect(persistedReceipts[0]?.hash).toBe(receipt.hash);

    session.end();
  });

  it('trace event submission', async () => {
    const { event } = await inv.trace({
      agentId: '01KKAKRQWACCSEVDEAW5G711ER',
      sessionId: `integ-trace-${Date.now()}`,
      action: { type: 'ToolInvocation', input: { tool: 'test', query: 'hello' } },
      fn: () => ({ response: 'world' }),
    });

    expect(event.nodeId).toBeTruthy();
    expect(event.hash).toBeTruthy();
  });
});
