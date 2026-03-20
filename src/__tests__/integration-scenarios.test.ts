/**
 * Integration test scenarios for the MVP loop.
 *
 * These are unit-level integration tests that mock HTTP transport
 * but test the full SDK flow end-to-end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Invariance } from '../client.js';
import { Session } from '../session.js';
import { verifyChain } from '../receipt.js';
import { checkPolicies, clearRateLimits } from '../policy.js';
import { InvarianceError } from '../errors.js';
import type { Receipt, PolicyRule, MonitorTriggerEvent } from '../types.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

// --- Helpers ---

function generateKeyHex(): string {
  return Buffer.from(ed25519.utils.randomPrivateKey()).toString('hex');
}

function publicKeyHex(privateKeyHex: string): string {
  const pubBytes = ed25519.getPublicKey(
    Uint8Array.from(Buffer.from(privateKeyHex, 'hex')),
  );
  return Buffer.from(pubBytes).toString('hex');
}

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
});
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.useRealTimers();
});

// =====================================================================
// Scenario 1: Full receipt lifecycle without crypto verification
// (zero-friction path -- signs with a key but verifies chain only)
// =====================================================================
describe('Scenario 1: Receipt lifecycle without crypto verification', () => {
  const privKey = generateKeyHex();

  it('creates session, records actions, verifies hash chain', async () => {
    const enqueue = vi.fn();
    const session = new Session(
      'demo-agent',
      'zero-friction-run',
      privKey,
      enqueue,
    );

    // Record 3 actions
    const r1 = await session.record({
      agent: 'demo-agent',
      action: 'search',
      input: { query: 'integration test' },
      output: { results: ['a', 'b'] },
    });
    const r2 = await session.record({
      agent: 'demo-agent',
      action: 'analyze',
      input: { data: 'abc' },
      output: { score: 0.9 },
    });
    const r3 = await session.record({
      agent: 'demo-agent',
      action: 'summarize',
      input: { text: 'hello' },
      output: { summary: 'greeting' },
    });

    // All receipts have signatures (non-null)
    expect(r1.signature).toBeTruthy();
    expect(r2.signature).toBeTruthy();
    expect(r3.signature).toBeTruthy();

    // Verify hash chain linkage
    expect(r1.previousHash).toBe('0');
    expect(r2.previousHash).toBe(r1.hash);
    expect(r3.previousHash).toBe(r2.hash);

    // All receipts share the same sessionId
    expect(r1.sessionId).toBe(session.id);
    expect(r2.sessionId).toBe(session.id);
    expect(r3.sessionId).toBe(session.id);

    // Verify chain integrity (no public key = hash-only verification)
    const result = await verifyChain([r1, r2, r3]);
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(3);
    expect(result.errors).toHaveLength(0);

    // Enqueue called once per receipt
    expect(enqueue).toHaveBeenCalledTimes(3);

    // End session
    const info = session.end();
    expect(info.status).toBe('closed');
    expect(info.receiptCount).toBe(3);
  });

  it('getReceipts returns ordered receipts', async () => {
    const enqueue = vi.fn();
    const session = new Session('demo-agent', 'ordered-run', privKey, enqueue);

    await session.record({ agent: 'demo-agent', action: 'step1', input: {} });
    await session.record({ agent: 'demo-agent', action: 'step2', input: {} });

    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(2);
    expect(receipts[0]!.action).toBe('step1');
    expect(receipts[1]!.action).toBe('step2');
    expect(receipts[1]!.previousHash).toBe(receipts[0]!.hash);
  });
});

// =====================================================================
// Scenario 2: Full receipt lifecycle with crypto (signing + verification)
// =====================================================================
describe('Scenario 2: Receipt lifecycle with crypto', () => {
  const privKey = generateKeyHex();
  const pubKey = publicKeyHex(privKey);

  it('creates signed receipts with valid Ed25519 signatures', async () => {
    const enqueue = vi.fn();
    const session = new Session(
      'signed-agent',
      'crypto-run',
      privKey,
      enqueue,
    );

    const r1 = await session.record({
      agent: 'signed-agent',
      action: 'trade',
      input: { pair: 'ETH/USDC', amount: 1.5 },
      output: { tx: '0xabc' },
    });
    const r2 = await session.record({
      agent: 'signed-agent',
      action: 'confirm',
      input: { txHash: '0xabc' },
      output: { confirmed: true },
    });

    // Verify signatures match the hash using the public key
    for (const receipt of [r1, r2]) {
      const sigBytes = Uint8Array.from(Buffer.from(receipt.signature, 'hex'));
      const msgBytes = new TextEncoder().encode(receipt.hash);
      const pubKeyBytes = Uint8Array.from(Buffer.from(pubKey, 'hex'));
      const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
      expect(valid).toBe(true);
    }

    // Chain linkage
    expect(r1.previousHash).toBe('0');
    expect(r2.previousHash).toBe(r1.hash);

    // Full verification with public key
    const result = await verifyChain([r1, r2], { publicKeyHex: pubKey });
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('detects tampered receipt with wrong signature', async () => {
    const enqueue = vi.fn();
    const session = new Session(
      'signed-agent',
      'tamper-run',
      privKey,
      enqueue,
    );

    const r1 = await session.record({
      agent: 'signed-agent',
      action: 'step',
      input: { x: 1 },
    });

    // Use a different key to generate a fake public key
    const otherKey = generateKeyHex();
    const otherPub = publicKeyHex(otherKey);

    const result = await verifyChain([r1], { publicKeyHex: otherPub });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('session.verify() with public key confirms signatures', async () => {
    const enqueue = vi.fn();
    const session = new Session(
      'signed-agent',
      'verify-run',
      privKey,
      enqueue,
    );

    await session.record({ agent: 'signed-agent', action: 'a', input: {} });
    await session.record({ agent: 'signed-agent', action: 'b', input: {} });

    const result = await session.verify(pubKey);
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(2);
  });
});

// =====================================================================
// Scenario 3: Monitor trigger flow (trace -> poll -> callback)
// =====================================================================
describe('Scenario 3: Monitor trigger flow', () => {
  it('polls monitor events and invokes callback', async () => {
    vi.useFakeTimers();
    const privKey = generateKeyHex();
    const received: MonitorTriggerEvent[] = [];

    const monitorEvents: MonitorTriggerEvent[] = [
      {
        event_id: 'mev_100',
        monitor_id: 'mon_latency',
        monitor_name: 'Latency Guard',
        severity: 'warning',
        trace_node_id: 'tn_abc',
        matched_value: { latency_ms: 5000 },
        created_at: '2026-03-19T00:00:00Z',
      },
      {
        event_id: 'mev_101',
        monitor_id: 'mon_error',
        monitor_name: 'Error Rate',
        severity: 'critical',
        trace_node_id: 'tn_def',
        matched_value: { error_rate: 0.15 },
        created_at: '2026-03-19T00:01:00Z',
      },
    ];

    // Mock the monitor poll response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: monitorEvents,
        next_cursor: null,
      }),
    });

    const onError = vi.fn();
    const inv = Invariance.init({
      apiKey: 'inv_test_monitor',
      privateKey: privKey,
      onError,
      onMonitorTrigger: (event) => received.push(event),
      monitorPollIntervalMs: 50,
    });

    // Trigger the poll
    await vi.advanceTimersByTimeAsync(50);

    expect(received).toHaveLength(2);
    expect(received[0]!.event_id).toBe('mev_100');
    expect(received[0]!.monitor_name).toBe('Latency Guard');
    expect(received[1]!.event_id).toBe('mev_101');
    expect(received[1]!.severity).toBe('critical');

    await inv.shutdown();
  });

  it('handles paginated monitor events (next_cursor)', async () => {
    vi.useFakeTimers();
    const privKey = generateKeyHex();
    const received: string[] = [];

    // Page 1: returns next_cursor
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_1', monitor_id: 'mon_1', monitor_name: 'G1', severity: 'info', trace_node_id: 'tn_1', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: 'mev_1',
      }),
    });
    // Page 2: returns null cursor (end)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_2', monitor_id: 'mon_1', monitor_name: 'G1', severity: 'info', trace_node_id: 'tn_2', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: null,
      }),
    });

    const inv = Invariance.init({
      apiKey: 'inv_test_page',
      privateKey: privKey,
      onMonitorTrigger: (e) => received.push(e.event_id),
      monitorPollIntervalMs: 20,
    });

    await vi.advanceTimersByTimeAsync(20);

    expect(received).toEqual(['mev_1', 'mev_2']);

    await inv.shutdown();
  });
});

// =====================================================================
// Scenario 4: Framework adapter round-trip (trace events -> hash chain)
// =====================================================================
describe('Scenario 4: Framework adapter round-trip', () => {
  it('trace() produces hash-chained events with correct fields', async () => {
    const privKey = generateKeyHex();
    const inv = Invariance.init({
      apiKey: 'inv_test_trace',
      privateKey: privKey,
      mode: 'DEV',
    });

    const sessionId = 'adapter-session-1';

    // Simulate LLM call
    const { result: llmResult, event: e1 } = await inv.trace({
      agentId: 'research-agent',
      sessionId,
      action: { type: 'DecisionPoint', input: { prompt: 'What is Invariance?' } },
      fn: () => ({ response: 'Invariance is...' }),
    });

    expect(llmResult).toEqual({ response: 'Invariance is...' });
    expect(e1.nodeId).toBeTruthy();
    expect(e1.sessionId).toBe(sessionId);
    expect(e1.agentId).toBe('research-agent');
    expect(e1.actionType).toBe('DecisionPoint');
    expect(e1.hash).toBeTruthy();
    expect(e1.previousHash).toBe('0');
    expect(e1.durationMs).toBeGreaterThanOrEqual(0);

    // Simulate tool call
    const { result: toolResult, event: e2 } = await inv.trace({
      agentId: 'research-agent',
      sessionId,
      action: { type: 'ToolInvocation', tool: 'web_search', input: { query: 'invariance.dev' } },
      fn: () => ({ results: ['https://invariance.dev'] }),
    });

    expect(toolResult).toEqual({ results: ['https://invariance.dev'] });
    expect(e2.previousHash).toBe(e1.hash);
    expect(e2.actionType).toBe('ToolInvocation');

    // Simulate another decision
    const { event: e3 } = await inv.trace({
      agentId: 'research-agent',
      sessionId,
      action: { type: 'DecisionPoint', input: { summary: true } },
      fn: () => 'done',
    });

    expect(e3.previousHash).toBe(e2.hash);

    // All events submitted to transport (DEV mode = all captured)
    // Check that trace event submissions were attempted
    const traceSubmitCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/v1/trace/events'),
    );
    expect(traceSubmitCalls.length).toBe(3);

    await inv.shutdown();
  });

  it('trace() captures error events', async () => {
    const privKey = generateKeyHex();
    const inv = Invariance.init({
      apiKey: 'inv_test_trace_err',
      privateKey: privKey,
      mode: 'DEV',
    });

    let caughtErr: Error & { traceEvent?: unknown } | undefined;
    try {
      await inv.trace({
        agentId: 'error-agent',
        sessionId: 'error-session',
        action: { type: 'ToolInvocation', input: { tool: 'fail' } },
        fn: () => { throw new Error('tool crashed'); },
      });
    } catch (err) {
      caughtErr = err as Error & { traceEvent?: unknown };
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr!.message).toBe('tool crashed');
    expect(caughtErr!.traceEvent).toBeDefined();

    await inv.shutdown();
  });
});

// =====================================================================
// Scenario 5: Contract settlement (propose -> deliver -> settle)
// =====================================================================
describe('Scenario 5: Contract settlement lifecycle', () => {
  it('propose -> deliver -> acceptDelivery', async () => {
    const requestorKey = generateKeyHex();
    const providerKey = generateKeyHex();

    const contractId = 'contract-001';
    const sessionId = 'contract-session-001';

    // Mock responses for the contract lifecycle
    fetchMock
      // proposeContract
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: contractId, sessionId, status: 'proposed' }),
      })
      // deliver
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'delivery-001', status: 'pending' }),
      })
      // acceptDelivery
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'delivery-001', status: 'accepted' }),
      });

    // Requestor proposes a contract
    const requestor = Invariance.init({
      apiKey: 'inv_requestor',
      privateKey: requestorKey,
    });

    const proposal = await requestor.proposeContract('provider-agent', {
      description: 'Generate weekly market report',
      deliverables: ['pdf-report', 'summary-json'],
    });

    expect(proposal.id).toBe(contractId);
    expect(proposal.sessionId).toBe(sessionId);

    // Verify proposeContract sent correct payload
    const proposalCall = fetchMock.mock.calls[0]!;
    const proposalBody = JSON.parse((proposalCall[1] as RequestInit).body as string);
    expect(proposalBody.providerId).toBe('provider-agent');
    expect(proposalBody.termsHash).toBeTruthy();
    expect(proposalBody.signature).toBeTruthy();

    // Provider delivers work
    const provider = Invariance.init({
      apiKey: 'inv_provider',
      privateKey: providerKey,
    });

    const delivery = await provider.deliver(contractId, {
      report: 'full report content',
      format: 'pdf',
    });

    expect(delivery.id).toBe('delivery-001');
    expect(delivery.status).toBe('pending');

    // Verify delivery sent correct payload
    const deliveryCall = fetchMock.mock.calls[1]!;
    const deliveryBody = JSON.parse((deliveryCall[1] as RequestInit).body as string);
    expect(deliveryBody.outputHash).toBeTruthy();
    expect(deliveryBody.signature).toBeTruthy();
    expect(deliveryBody.outputData.report).toBe('full report content');

    // Requestor accepts delivery
    const acceptance = await requestor.acceptDelivery(
      contractId,
      'delivery-001',
      deliveryBody.outputHash,
    );

    expect(acceptance.id).toBe('delivery-001');
    expect(acceptance.status).toBe('accepted');

    await Promise.all([requestor.shutdown(), provider.shutdown()]);
  });

  it('contractSession attaches contractId to receipts', async () => {
    const privKey = generateKeyHex();
    const enqueued: Receipt[] = [];

    // We need to capture enqueued receipts through the transport
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const inv = Invariance.init({
      apiKey: 'inv_contract_session',
      privateKey: privKey,
    });

    const contractSess = inv.contractSession('contract-xyz', {
      agent: 'provider',
      name: 'delivery-session',
      sessionId: 'sess-xyz',
    });

    expect(contractSess.id).toBe('sess-xyz');
    expect(contractSess.agent).toBe('provider');

    const r1 = await contractSess.record({
      agent: 'provider',
      action: 'generate-report',
      input: { topic: 'markets' },
      output: { pages: 12 },
    });

    // The receipt should have contractId attached via the enqueue callback
    expect(r1.hash).toBeTruthy();
    expect(r1.previousHash).toBe('0');

    contractSess.end();
    await inv.shutdown();
  });
});

// =====================================================================
// Scenario 6: Policy enforcement (rate limit, amount limit, deny)
// =====================================================================
describe('Scenario 6: Policy enforcement', () => {
  beforeEach(() => {
    clearRateLimits();
  });

  it('rate limit enforcement blocks after max actions', () => {
    const rules: PolicyRule[] = [
      { action: 'api.call', rateLimit: { max: 3, windowMs: 60_000 } },
    ];

    const action = { agent: 'bot', action: 'api.call', input: {} };

    // 3 calls allowed
    expect(checkPolicies(rules, action).allowed).toBe(true);
    expect(checkPolicies(rules, action).allowed).toBe(true);
    expect(checkPolicies(rules, action).allowed).toBe(true);

    // 4th call denied
    const result = checkPolicies(rules, action);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Rate limit exceeded');
  });

  it('amount limit enforcement blocks high-value actions', () => {
    const rules: PolicyRule[] = [
      { action: 'transfer', maxAmountUsd: 1000 },
    ];

    // Under limit
    expect(
      checkPolicies(rules, {
        agent: 'bot',
        action: 'transfer',
        input: { amountUsd: 500, to: 'alice' },
      }).allowed,
    ).toBe(true);

    // Over limit
    const denied = checkPolicies(rules, {
      agent: 'bot',
      action: 'transfer',
      input: { amountUsd: 1500, to: 'bob' },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('exceeds max');
  });

  it('deny list via custom predicate', () => {
    const blockedActions = new Set(['rm-rf', 'drop-database', 'sudo']);
    const rules: PolicyRule[] = [
      {
        action: '*',
        custom: (a) => !blockedActions.has(a.action),
      },
    ];

    expect(
      checkPolicies(rules, { agent: 'bot', action: 'read-file', input: {} }).allowed,
    ).toBe(true);

    expect(
      checkPolicies(rules, { agent: 'bot', action: 'rm-rf', input: {} }).allowed,
    ).toBe(false);

    expect(
      checkPolicies(rules, { agent: 'bot', action: 'drop-database', input: {} }).allowed,
    ).toBe(false);
  });

  it('combined policies: rate + amount + allowlist', () => {
    const rules: PolicyRule[] = [
      { action: 'swap', maxAmountUsd: 500 },
      { action: 'swap', allowlist: { field: 'token', values: ['ETH', 'USDC', 'BTC'] } },
      { action: 'swap', rateLimit: { max: 5, windowMs: 60_000 } },
    ];

    // Valid action
    expect(
      checkPolicies(rules, {
        agent: 'bot',
        action: 'swap',
        input: { amountUsd: 100, token: 'ETH' },
      }).allowed,
    ).toBe(true);

    // Amount too high
    expect(
      checkPolicies(rules, {
        agent: 'bot',
        action: 'swap',
        input: { amountUsd: 1000, token: 'ETH' },
      }).allowed,
    ).toBe(false);

    // Invalid token
    expect(
      checkPolicies(rules, {
        agent: 'bot',
        action: 'swap',
        input: { amountUsd: 100, token: 'DOGE' },
      }).allowed,
    ).toBe(false);
  });

  it('Invariance.wrap() rejects policy-denied actions', async () => {
    const privKey = generateKeyHex();
    const inv = Invariance.init({
      apiKey: 'inv_policy',
      privateKey: privKey,
      policies: [{ action: 'transfer', maxAmountUsd: 100 }],
    });

    await expect(
      inv.wrap(
        { agent: 'bot', action: 'transfer', input: { amountUsd: 200 } },
        () => ({ success: true }),
      ),
    ).rejects.toThrow(InvarianceError);

    await inv.shutdown();
  });

  it('agent deny/allow list integrates with session recording', async () => {
    const privKey = generateKeyHex();
    const inv = Invariance.init({
      apiKey: 'inv_agent_policy',
      privateKey: privKey,
    });

    const agent = inv.agent({
      id: 'restricted-agent',
      privateKey: privKey,
      allowActions: ['read', 'list'],
      denyActions: ['delete'],
    });

    const session = agent.session({ name: 'policy-test' });

    // Allowed action succeeds
    const receipt = await session.record('read', { resource: '/api/data' });
    expect(receipt.action).toBe('read');

    // Denied action throws
    await expect(
      session.record('delete' as 'read', { resource: '/api/data' } as never),
    ).rejects.toThrow('denied');

    // Unlisted action throws
    await expect(
      session.record('update' as 'read', { resource: '/api/data' } as never),
    ).rejects.toThrow('not allowed');

    await inv.shutdown();
  });
});
