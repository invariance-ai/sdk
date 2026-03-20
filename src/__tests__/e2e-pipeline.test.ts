import { describe, it, expect, vi, afterEach } from 'vitest';
import { Invariance } from '../client.js';
import { InvarianceError } from '../errors.js';
import { verifyChain } from '../receipt.js';
import { InvarianceTracer } from '../observability/tracer.js';
import { Transport } from '../transport.js';
import { action } from '../templates.js';
import type { InvarianceConfig } from '../types.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');
const pubKey = ed25519.getPublicKey(privKey);
const pubKeyHex = Buffer.from(pubKey).toString('hex');

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal('fetch', fetchMock);

const activeClients: Invariance[] = [];

function createInvariance(overrides?: Partial<InvarianceConfig>) {
  const inv = Invariance.init({
    apiKey: 'inv_test',
    privateKey: privKeyHex,
    ...overrides,
  });
  activeClients.push(inv);
  return inv;
}

afterEach(async () => {
  await Promise.all(activeClients.map((client) => client.shutdown()));
  activeClients.length = 0;
  fetchMock.mockClear();
});

// ─── Suite 1: Session receipt chain pipeline ─────────────────────────────────

describe('Session receipt chain pipeline', () => {
  it('init -> session -> record 5 actions -> end -> verify chain', async () => {
    const inv = createInvariance();
    const session = inv.session({ agent: 'bot', name: 'chain-run' });

    for (let i = 0; i < 5; i++) {
      await session.record({ agent: 'bot', action: 'step', input: { i } });
    }

    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(5);

    // First receipt chains from '0'
    expect(receipts[0]!.previousHash).toBe('0');

    // Each subsequent receipt chains correctly
    for (let i = 1; i < receipts.length; i++) {
      expect(receipts[i]!.previousHash).toBe(receipts[i - 1]!.hash);
    }

    // Verify chain
    const result = await session.verify();
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(5);

    session.end();
    await inv.shutdown();

    const receiptSubmitCall = fetchMock.mock.calls.find(
      ([url]) => String(url).includes('/v1/receipts'),
    );
    expect(receiptSubmitCall).toBeDefined();

    const [, options] = receiptSubmitCall!;
    const payload = JSON.parse(String((options as RequestInit).body)) as { receipts: unknown[] };
    expect(payload.receipts).toHaveLength(5);
  });

  it('tamper detection', async () => {
    const inv = createInvariance();
    const session = inv.session({ agent: 'bot', name: 'tamper-run' });

    for (let i = 0; i < 3; i++) {
      await session.record({ agent: 'bot', action: 'step', input: { i } });
    }

    const receipts = session.getReceipts();
    const tampered = receipts.map((r) => ({ ...r }));
    tampered[1]!.hash = 'deadbeef';

    const result = await verifyChain(tampered);
    expect(result.valid).toBe(false);
  });

  it('signature verification roundtrip', async () => {
    const inv = createInvariance();
    const session = inv.session({ agent: 'bot', name: 'sig-run' });

    await session.record({ agent: 'bot', action: 'step', input: { x: 1 } });
    await session.record({ agent: 'bot', action: 'step', input: { x: 2 } });

    // Verify with correct public key
    const valid = await session.verify(pubKeyHex);
    expect(valid.valid).toBe(true);

    // Verify with wrong public key
    const wrongPriv = ed25519.utils.randomPrivateKey();
    const wrongPub = ed25519.getPublicKey(wrongPriv);
    const wrongPubHex = Buffer.from(wrongPub).toString('hex');

    const receipts = session.getReceipts();
    const invalid = await verifyChain(receipts as any, { publicKeyHex: wrongPubHex });
    expect(invalid.valid).toBe(false);
  }, 15_000);
});

// ─── Suite 1b: Session.wrap() pipeline ────────────────────────────────────────

describe('Session.wrap() pipeline', () => {
  it('wrap within session records receipt and returns result', async () => {
    const inv = createInvariance();
    const session = inv.session({ agent: 'bot', name: 'wrap-run' });

    const { result, receipt } = await session.wrap(
      { action: 'compute', input: { n: 10 } },
      () => ({ answer: 100 }),
    );

    expect(result).toEqual({ answer: 100 });
    expect(receipt.action).toBe('compute');
    expect(receipt.agent).toBe('bot');

    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.hash).toBe(receipt.hash);

    session.end();
  });

  it('wrap records error receipt on failure and rethrows', async () => {
    const inv = createInvariance();
    const session = inv.session({ agent: 'bot', name: 'wrap-err' });

    let caughtErr: any;
    try {
      await session.wrap(
        { action: 'risky', input: {} },
        () => { throw new Error('explosion'); },
      );
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr.message).toBe('explosion');
    expect(caughtErr.receipt.error).toBe('explosion');

    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.error).toBe('explosion');

    session.end();
  });
});

// ─── Suite 2: Tracer span tree pipeline ──────────────────────────────────────

function makeTracer(
  overrides?: Partial<{
    mode: 'DEV' | 'PROD';
    sampleRate: number;
    anomalyThreshold: number;
    random: () => number;
    now: () => number;
  }>,
) {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({
      valid: true,
      executionId: 'exec-1',
      chain: [],
      signedBy: 'invariance',
      anchored: true,
      anchoredAt: '2026-03-06T00:00:00.000Z',
    }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: overrides?.mode ?? 'DEV',
    sampleRate: overrides?.sampleRate,
    anomalyThreshold: overrides?.anomalyThreshold,
    random: overrides?.random,
    now: overrides?.now,
  });

  return { tracer, transport };
}

describe('Tracer span tree pipeline', () => {
  it('3-level sequential trace tree in DEV mode', async () => {
    const { tracer, transport } = makeTracer({ mode: 'DEV', now: () => 1_000 });
    const sessionId = 'sess-tree';

    const { event: e1 } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      action: { type: 'DecisionPoint', input: { step: 1 } },
      fn: () => 'r1',
    });

    const { event: e2 } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      parentNodeId: e1.nodeId,
      action: { type: 'ToolInvocation', input: { step: 2 } },
      fn: () => 'r2',
    });

    const { event: e3 } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      parentNodeId: e2.nodeId,
      action: { type: 'SubAgentSpawn', input: { step: 3 } },
      fn: () => 'r3',
    });

    // Parent-child nodeId links
    expect(e2.parentNodeId).toBe(e1.nodeId);
    expect(e3.parentNodeId).toBe(e2.nodeId);

    // Hash chain links
    expect(e1.previousHash).toBe('0');
    expect(e2.previousHash).toBe(e1.hash);
    expect(e3.previousHash).toBe(e2.hash);

    // DEV tree
    const tree = tracer.getDevTree(sessionId);
    expect(tree).toHaveLength(3);

    // All submitted
    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(3);
  });

  it('error in trace preserves chain', async () => {
    const { tracer, transport } = makeTracer({ mode: 'DEV', now: () => 2_000 });
    const sessionId = 'sess-err';

    const { event: e1 } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: 1 } },
      fn: () => 'ok1',
    });

    const { event: e2 } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      parentNodeId: e1.nodeId,
      action: { type: 'ToolInvocation', input: { step: 2 } },
      fn: () => 'ok2',
    });

    let caughtErr: any;
    try {
      await tracer.trace({
        sessionId,
        agentId: 'agent-1',
        parentNodeId: e2.nodeId,
        action: { type: 'ToolInvocation', input: { step: 3 } },
        fn: () => {
          throw new Error('boom');
        },
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr.traceEvent).toBeDefined();
    expect(caughtErr.traceEvent.previousHash).toBe(e2.hash);
    expect(caughtErr.traceEvent.anomalyScore).toBe(0.8);
    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(3);
  });

  it('PROD sampling + hot path escalation', async () => {
    const { tracer, transport } = makeTracer({
      mode: 'PROD',
      sampleRate: 0,
      random: () => 1,
      now: () => 5_000,
    });

    // First trace errors -> captured + hot path marked for its spanId
    await expect(
      tracer.trace({
        sessionId: 'sess-hp',
        spanId: 'span-hot',
        agentId: 'agent-1',
        action: { type: 'ToolInvocation', input: { step: 1 } },
        fn: () => {
          throw new Error('fail');
        },
      }),
    ).rejects.toThrow('fail');

    // Second trace same spanId succeeds -> captured via hot path
    await tracer.trace({
      sessionId: 'sess-hp',
      spanId: 'span-hot',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: 2 } },
      fn: () => 'ok',
    });

    // Third trace different spanId -> not captured (sampleRate=0, random=1)
    await tracer.trace({
      sessionId: 'sess-hp',
      spanId: 'span-cold',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: 3 } },
      fn: () => 'ok',
    });

    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(2);
  });
});

// ─── Suite 3: Agent-scoped session with policies ─────────────────────────────

describe('Agent-scoped session with policies', () => {
  it('inv.agent() returns { id, session() } where session() returns AgentSession', () => {
    const inv = createInvariance();
    const agent = inv.agent({
      id: 'my-agent',
      privateKey: privKeyHex,
    });

    expect(agent.id).toBe('my-agent');
    expect(typeof agent.session).toBe('function');

    const session = agent.session({ name: 'run-1' });
    expect(session.id).toBeTruthy();
    expect(session.agent).toBe('my-agent');
    expect(session.name).toBe('run-1');
    expect(typeof session.record).toBe('function');
    expect(typeof session.end).toBe('function');
    expect(typeof session.info).toBe('function');

    // AgentSession does NOT expose getReceipts or verify
    expect((session as any).getReceipts).toBeUndefined();
    expect((session as any).verify).toBeUndefined();
  });

  it('allow/deny enforcement across record calls', async () => {
    const inv = createInvariance();

    const actions = {
      allowed: action<{ x: number }>({ label: 'Allowed' }),
      denied: action<{ x: number }>({ label: 'Denied' }),
      unlisted: action<{ x: number }>({ label: 'Unlisted' }),
    };

    const agent = inv.agent({
      id: 'policy-agent',
      privateKey: privKeyHex,
      actions,
      allowActions: ['allowed'],
      denyActions: ['denied'],
    });

    const session = agent.session({ name: 'policy-run' });

    // Allowed action succeeds
    const receipt = await session.record('allowed', { x: 1 });
    expect(receipt).toBeDefined();
    expect(receipt.action).toBe('allowed');

    // Denied action throws POLICY_DENIED
    await expect(session.record('denied', { x: 2 })).rejects.toThrow(InvarianceError);
    try {
      await session.record('denied', { x: 2 });
    } catch (err) {
      expect((err as InvarianceError).code).toBe('POLICY_DENIED');
    }

    // Unlisted action (not in allowActions) throws "not allowed"
    await expect(session.record('unlisted', { x: 3 })).rejects.toThrow('not allowed');
  });
});

// ─── Suite 4: wrap() pipeline ────────────────────────────────────────────────

describe('wrap() pipeline', () => {
  it('wrap with allowed action succeeds', async () => {
    const inv = createInvariance();

    const { result, receipt } = await inv.wrap(
      { agent: 'bot', action: 'compute', input: { n: 42 } },
      () => ({ answer: 42 }),
    );

    expect(result).toEqual({ answer: 42 });
    expect(receipt).toBeDefined();
    expect(receipt.action).toBe('compute');
    expect(receipt.agent).toBe('bot');
  });

  it('wrap with policy-denied action throws POLICY_DENIED, fn never called', async () => {
    const inv = createInvariance({
      policies: [{ action: 'forbidden', custom: () => false }],
    });

    const fn = vi.fn(() => 'should not run');

    await expect(
      inv.wrap({ agent: 'bot', action: 'forbidden', input: {} }, fn),
    ).rejects.toThrow(InvarianceError);

    try {
      await inv.wrap({ agent: 'bot', action: 'forbidden', input: {} }, fn);
    } catch (err) {
      expect((err as InvarianceError).code).toBe('POLICY_DENIED');
    }

    expect(fn).not.toHaveBeenCalled();
  });

  it('wrap with throwing fn records receipt with error and rethrows with .receipt', async () => {
    const inv = createInvariance();

    let caughtErr: any;
    try {
      await inv.wrap(
        { agent: 'bot', action: 'risky', input: { x: 1 } },
        () => {
          throw new Error('fn exploded');
        },
      );
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toBe('fn exploded');
    expect(caughtErr.receipt).toBeDefined();
    expect(caughtErr.receipt.error).toBe('fn exploded');
    expect(caughtErr.receipt.action).toBe('risky');
  });
});

// ─── Suite 5: Behavioral events pipeline ─────────────────────────────────────

describe('Behavioral events pipeline', () => {
  it('emit all 4 behavioral primitives', async () => {
    const { tracer, transport } = makeTracer({ mode: 'DEV' });

    // We need to access emit via tracer directly since we have mock transport
    tracer.emit('DecisionPoint', {
      nodeId: 'n1',
      candidates: ['a', 'b'],
      chosen: 'a',
      depth: 0,
    });

    tracer.emit('GoalDrift', {
      nodeId: 'n2',
      originalGoal: 'goal-A',
      currentGoal: 'goal-B',
      similarity: 0.5,
    });

    tracer.emit('SubAgentSpawn', {
      parentNodeId: 'n1',
      childAgentId: 'child-1',
      depth: 1,
    });

    tracer.emit('ToolInvocation', {
      nodeId: 'n3',
      tool: 'web_search',
      inputHash: 'abc',
      outputHash: 'def',
      latencyMs: 100,
    });

    // Let fire-and-forget promises settle
    await new Promise((r) => setTimeout(r, 0));

    expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(4);
  });
});
