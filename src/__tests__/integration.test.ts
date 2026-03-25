/**
 * Integration tests against the live demo backend.
 *
 * Run with:
 *   pnpm test:integ          (loads .env.demo automatically)
 *
 * Or manually:
 *   INVARIANCE_API_URL=https://... \
 *   INVARIANCE_API_KEY=inv_... \
 *   INVARIANCE_PRIVATE_KEY=... \
 *   INVARIANCE_AGENT_ID=... \
 *   pnpm vitest run src/__tests__/integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Invariance } from '../client.js';
import { verifyChain } from '../receipt.js';
import { getPublicKey, ed25519Verify, generateKeypair } from '../crypto.js';
import { InvarianceError } from '../errors.js';
import { HttpClient } from '../http.js';

const API_URL = process.env.INVARIANCE_API_URL;
const API_KEY = process.env.INVARIANCE_API_KEY;
const PRIV_KEY = process.env.INVARIANCE_PRIVATE_KEY;
const AGENT_ID = process.env.INVARIANCE_AGENT_ID;
const shouldRun = !!(API_URL && API_KEY && PRIV_KEY && AGENT_ID);

describe.skipIf(!shouldRun)('Integration: SDK launch readiness', () => {
  let inv: Invariance;
  let http: HttpClient;
  const testRunId = Date.now().toString(36);

  beforeAll(() => {
    inv = Invariance.init({
      apiUrl: API_URL!,
      apiKey: API_KEY!,
      privateKey: PRIV_KEY!,
      flushIntervalMs: 500,
      maxBatchSize: 10,
    });

    http = new HttpClient({
      baseUrl: API_URL!,
      apiKey: API_KEY!,
    });
  });

  afterAll(async () => {
    await inv.shutdown();
  });

  // ── Connectivity ──────────────────────────────────────────────

  it('can reach the backend (health check)', async () => {
    const health = await http.get<{ ok: boolean; version: string }>('/v1/health');
    expect(health.ok).toBe(true);
    expect(health.version).toBeTruthy();
  });

  // ── Session lifecycle ─────────────────────────────────────────

  it('session lifecycle: create → record → verify chain → close', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `lifecycle-${testRunId}`,
    });

    expect(session.id).toBeTruthy();

    // Record first action (chain root)
    const r1 = await session.record({
      action: 'search',
      input: { query: 'integration test' },
      output: { results: ['a', 'b'] },
    });
    expect(r1.hash).toBeTruthy();
    expect(r1.previousHash).toBe('0');
    expect(r1.signature).toBeTruthy();

    // Record second action (chained)
    const r2 = await session.record({
      action: 'analyze',
      input: { data: r1.hash },
      output: { score: 0.95 },
    });
    expect(r2.previousHash).toBe(r1.hash);

    // Record third action
    const r3 = await session.record({
      action: 'report',
      input: { analysis: 'complete' },
      output: { summary: 'all good' },
    });
    expect(r3.previousHash).toBe(r2.hash);

    // Check local state
    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(3);

    // Flush before close to ensure receipts are on server
    await inv.flush();

    // Close session
    const info = await session.end();
    expect(info.status).toBe('closed');
    expect(info.receiptCount).toBe(3);
    expect(info.rootHash).toBe(r1.hash);
    expect(info.closeHash).toBe(r3.hash);
  });

  it('session state retrievable from server', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `get-session-${testRunId}`,
    });

    const remote = await inv.sessions.get(session.id);
    expect(remote.id).toBe(session.id);
    expect(remote.status).toBe('open');

    await session.end();

    const remoteClosed = await inv.sessions.get(session.id);
    expect(remoteClosed.status).toBe('closed');
  });

  // ── Receipt persistence ───────────────────────────────────────

  it('receipts persist after flush and can be queried', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `persist-${testRunId}`,
    });

    const r1 = await session.record({
      action: 'step-1',
      input: { x: 1 },
      output: { y: 2 },
    });
    const r2 = await session.record({
      action: 'step-2',
      input: { x: 3 },
      output: { y: 4 },
    });

    await inv.flush();

    const persisted = await inv.receipts.query({ sessionId: session.id });
    expect(persisted.length).toBeGreaterThanOrEqual(2);

    // Verify hashes match local receipts
    const hashes = persisted.map((r) => r.hash);
    expect(hashes).toContain(r1.hash);
    expect(hashes).toContain(r2.hash);

    await session.end();
  });

  it('receipts can be queried by session', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `query-${testRunId}`,
    });

    await session.record({ action: 'search', input: { q: 'a' } });
    await session.record({ action: 'analyze', input: { q: 'b' } });
    await session.record({ action: 'search', input: { q: 'c' } });

    await inv.flush();

    const bySession = await inv.receipts.query({ sessionId: session.id });
    expect(bySession.length).toBeGreaterThanOrEqual(3);

    await session.end();
  });

  // ── wrap() ────────────────────────────────────────────────────

  it('wrap() executes function and captures result in receipt', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `wrap-sync-${testRunId}`,
    });

    const { result, receipt } = await session.wrap(
      { action: 'compute', input: { x: 42 } },
      () => ({ answer: 1764 }),
    );

    expect(result).toEqual({ answer: 1764 });
    expect(receipt.action).toBe('compute');
    expect(receipt.output).toEqual({ answer: 1764 });
    expect(receipt.hash).toBeTruthy();
    expect(receipt.signature).toBeTruthy();

    await inv.flush();
    const persisted = await inv.receipts.query({ sessionId: session.id });
    expect(persisted.length).toBeGreaterThanOrEqual(1);

    await session.end();
  });

  it('wrap() works with async functions', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `wrap-async-${testRunId}`,
    });

    const { result, receipt } = await session.wrap(
      { action: 'async-compute', input: { delay: 10 } },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { computed: true };
      },
    );

    expect(result).toEqual({ computed: true });
    expect(receipt.output).toEqual({ computed: true });

    await session.end();
  });

  it('wrap() captures errors in receipt and rethrows', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `wrap-error-${testRunId}`,
    });

    const err: any = await session
      .wrap({ action: 'failing-op', input: { should: 'fail' } }, () => {
        throw new Error('intentional failure');
      })
      .catch((e: any) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('intentional failure');
    expect(err.receipt).toBeDefined();
    expect(err.receipt.error).toBe('intentional failure');
    expect(err.receipt.action).toBe('failing-op');

    await session.end();
  });

  // ── Cryptographic integrity ───────────────────────────────────

  it('local hash chain verification passes for valid chain', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `chain-verify-${testRunId}`,
    });

    for (let i = 1; i <= 5; i++) {
      await session.record({ action: `step-${i}`, input: { n: i } });
    }

    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(5);

    const publicKey = getPublicKey(PRIV_KEY!);
    const result = await verifyChain([...receipts], publicKey);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    await session.end();
  });

  it('Ed25519 signatures on receipts are verifiable', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `sig-verify-${testRunId}`,
    });

    const receipt = await session.record({
      action: 'signed-action',
      input: { data: 'important' },
    });

    expect(receipt.signature).toBeTruthy();
    expect(receipt.signature).toHaveLength(128); // 64 bytes = 128 hex chars

    // Verify with correct key
    const publicKey = getPublicKey(PRIV_KEY!);
    const isValid = ed25519Verify(receipt.hash, receipt.signature, publicKey);
    expect(isValid).toBe(true);

    // Verify with wrong key fails
    const wrongKey = generateKeypair();
    const isInvalid = ed25519Verify(receipt.hash, receipt.signature, wrongKey.publicKey);
    expect(isInvalid).toBe(false);

    await session.end();
  });

  // ── Trace events ──────────────────────────────────────────────

  it('trace events can be submitted', async () => {
    const sessionId = `trace-session-${testRunId}`;

    const result = await inv.trace.submitEvents({
      session_id: sessionId,
      agent_id: AGENT_ID!,
      action_type: 'tool_invocation',
      input: { tool: 'search', query: 'test' },
      output: { results: ['item1'] },
      duration_ms: 150,
      metadata: {
        depth: 1,
        branch_factor: 1,
        execution_ms: 150,
        token_cost: 100,
        tool_calls: ['search'],
        tags: ['test'],
      },
    });

    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);

    const node = result.nodes[0]!;
    expect(node.session_id).toBe(sessionId);
    expect(node.action_type).toBe('tool_invocation');
    expect(node.hash).toBeTruthy();
  });

  // ── Server-side verification ──────────────────────────────────

  it('server verifies receipt chain integrity', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `server-verify-${testRunId}`,
    });

    await session.record({ action: 'op-1', input: { v: 1 } });
    await session.record({ action: 'op-2', input: { v: 2 } });
    await session.record({ action: 'op-3', input: { v: 3 } });

    await inv.flush();
    await session.end();

    const verification = await inv.sessions.verify(session.id);
    expect(verification.valid).toBe(true);
  });

  // ── Error handling ────────────────────────────────────────────

  it('invalid API key returns InvarianceError', async () => {
    const badInv = Invariance.init({
      apiUrl: API_URL!,
      apiKey: 'invalid_key_12345',
      privateKey: PRIV_KEY!,
    });

    try {
      await badInv.createSession({
        agent: 'should-fail',
        name: 'error-test',
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvarianceError);
      const invErr = err as InvarianceError;
      expect(invErr.code).toBe('API_ERROR');
      expect(invErr.statusCode).toBeDefined();
      expect([401, 403]).toContain(invErr.statusCode);
    } finally {
      await badInv.shutdown();
    }
  });

  it('recording on closed session throws SESSION_CLOSED', async () => {
    const session = await inv.createSession({
      agent: AGENT_ID!,
      name: `closed-session-${testRunId}`,
    });

    await session.end();

    try {
      await session.record({ action: 'should-fail', input: {} });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvarianceError);
      expect((err as InvarianceError).code).toBe('SESSION_CLOSED');
    }
  });

  // ── Client convenience & static methods ───────────────────────

  it('static crypto utilities produce valid keys', () => {
    const kp = Invariance.generateKeypair();
    expect(kp.privateKey).toHaveLength(64);
    expect(kp.publicKey).toHaveLength(64);

    // getPublicKey roundtrip
    const pub = Invariance.getPublicKey(kp.privateKey);
    expect(pub).toBe(kp.publicKey);

    // deriveKeypair is deterministic
    const derived1 = Invariance.deriveKeypair(kp.privateKey, 'org/agent-1');
    const derived2 = Invariance.deriveKeypair(kp.privateKey, 'org/agent-1');
    expect(derived1.privateKey).toBe(derived2.privateKey);
    expect(derived1.publicKey).toBe(derived2.publicKey);

    // Different identity = different key
    const derived3 = Invariance.deriveKeypair(kp.privateKey, 'org/agent-2');
    expect(derived3.privateKey).not.toBe(derived1.privateKey);
  });
});
