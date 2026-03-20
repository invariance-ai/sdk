import { describe, it, expect, vi } from 'vitest';
import { Session } from '../session.js';
import { InvarianceError } from '../errors.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

function makeSession(opts?: {
  onCreateSession?: Parameters<typeof Session['prototype']['constructor']>[4];
  onCloseSession?: Parameters<typeof Session['prototype']['constructor']>[5];
  onError?: Parameters<typeof Session['prototype']['constructor']>[6];
}) {
  const enqueue = vi.fn();
  const session = new Session(
    'test-agent',
    'test-session',
    privKeyHex,
    enqueue,
    opts?.onCreateSession,
    opts?.onCloseSession,
    opts?.onError,
  );
  return { session, enqueue };
}

describe('Session', () => {
  it('creates with unique ULID id', () => {
    const { session: s1 } = makeSession();
    const { session: s2 } = makeSession();
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
  });

  it('record() creates chained receipts with correct previousHash', async () => {
    const { session, enqueue } = makeSession();
    const action = { agent: 'test-agent', action: 'step', input: { x: 1 } };

    const r1 = await session.record(action);
    expect(r1.previousHash).toBe('0');

    const r2 = await session.record(action);
    expect(r2.previousHash).toBe(r1.hash);

    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('record() on closed session throws', async () => {
    const { session } = makeSession();
    session.end();
    await expect(session.record({ agent: 'a', action: 'b', input: {} })).rejects.toThrow('closed');
  });

  it('record() rejects actions for a different agent', async () => {
    const { session } = makeSession();
    await expect(session.record({ agent: 'other-agent', action: 'b', input: {} })).rejects.toThrow('does not match session agent');
  });

  it('end() changes status and returns info', () => {
    const { session } = makeSession();
    const info = session.end();
    expect(info.status).toBe('closed');
    expect(info.agent).toBe('test-agent');
  });

  it('end() calls onCloseSession callback', () => {
    const onClose = vi.fn().mockResolvedValue(undefined);
    const { session } = makeSession({ onCloseSession: onClose });
    session.end();
    expect(onClose).toHaveBeenCalledWith(session.id, 'closed', '0');
  });

  it('constructor calls onCreateSession callback', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { session } = makeSession({ onCreateSession: onCreate });
    expect(onCreate).toHaveBeenCalledWith({ id: session.id, name: 'test-session' });
  });

  it('getReceipts() returns recorded receipts', async () => {
    const { session } = makeSession();
    const action = { agent: 'test-agent', action: 'step', input: { x: 1 } };
    await session.record(action);
    await session.record(action);
    const receipts = session.getReceipts();
    expect(receipts).toHaveLength(2);
    expect(receipts[0]!.previousHash).toBe('0');
    expect(receipts[1]!.previousHash).toBe(receipts[0]!.hash);
  });

  it('verify() returns valid result', async () => {
    const { session } = makeSession();
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 2 } });
    const result = await session.verify();
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(2);
  });

  it('ready resolves after create callback', async () => {
    let resolved = false;
    const onCreate = vi.fn().mockImplementation(async () => { resolved = true; });
    const { session } = makeSession({ onCreateSession: onCreate });
    await session.ready;
    expect(resolved).toBe(true);
  });

  it('forwards create-session failures to onError and still resolves ready', async () => {
    const onError = vi.fn();
    const onCreate = vi.fn().mockRejectedValue(new Error('create failed'));
    const { session } = makeSession({ onCreateSession: onCreate, onError });
    await expect(session.ready).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('Session.create() rejects when create callback fails', async () => {
    const onError = vi.fn();
    const onCreate = vi.fn().mockRejectedValue(new Error('create failed'));
    const enqueue = vi.fn();

    await expect(
      Session.create(
        'test-agent',
        'test-session',
        privKeyHex,
        enqueue,
        onCreate,
        undefined,
        onError,
      ),
    ).rejects.toThrow('Failed to initialize session');

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('forwards close-session failures to onError', async () => {
    const onError = vi.fn();
    const onClose = vi.fn().mockRejectedValue(new Error('close failed'));
    const { session } = makeSession({ onCloseSession: onClose, onError });
    session.end();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  it('record() awaits ready before proceeding', async () => {
    let createResolved = false;
    const onCreate = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      setTimeout(() => { createResolved = true; resolve(); }, 50);
    }));
    const { session } = makeSession({ onCreateSession: onCreate });

    // record should wait for ready
    const recordPromise = session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    // createResolved should be false initially
    expect(createResolved).toBe(false);
    await recordPromise;
    expect(createResolved).toBe(true);
  });

  it('record() defaults agent to session agent when omitted', async () => {
    const { session, enqueue } = makeSession();
    const receipt = await session.record({ action: 'step', input: { x: 1 } } as any);
    expect(receipt.agent).toBe('test-agent');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('record() throws SESSION_NOT_READY when initialization failed', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('create failed'));
    const { session } = makeSession({ onCreateSession: onCreate });
    await expect(session.record({ action: 'step', input: { x: 1 } } as any)).rejects.toMatchObject({
      name: 'InvarianceError',
      code: 'SESSION_NOT_READY',
    } satisfies Partial<InvarianceError>);
  });

  it('wrap() executes fn and records receipt within session', async () => {
    const { session } = makeSession();
    const { result, receipt } = await session.wrap(
      { action: 'compute', input: { n: 42 } },
      () => ({ answer: 42 }),
    );
    expect(result).toEqual({ answer: 42 });
    expect(receipt.action).toBe('compute');
    expect(receipt.agent).toBe('test-agent');
  });

  it('wrap() records error and rethrows on fn failure', async () => {
    const { session } = makeSession();
    let caughtErr: any;
    try {
      await session.wrap(
        { action: 'risky', input: {} },
        () => { throw new Error('boom'); },
      );
    } catch (err) {
      caughtErr = err;
    }
    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toBe('boom');
    expect(caughtErr.receipt).toBeDefined();
    expect(caughtErr.receipt.error).toBe('boom');
  });

  it('wrap() checks policies before executing', async () => {
    const { session } = makeSession();
    await expect(
      session.wrap(
        { action: 'forbidden', input: {} },
        () => 'should not run',
        () => ({ allowed: false, reason: 'Policy denied' }),
      ),
    ).rejects.toThrow('Policy denied');
  });

  it('does not throw if onError itself throws', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('create failed'));
    const onError = vi.fn(() => {
      throw new Error('observer failure');
    });
    const { session } = makeSession({ onCreateSession: onCreate, onError });
    await expect(session.ready).resolves.toBeUndefined();
  });

  // --- Concurrency & Ordering ---

  it('multiple sequential record() calls produce correct chain (3+ receipts)', async () => {
    const { session } = makeSession();
    const action = { agent: 'test-agent', action: 'step', input: { x: 1 } };

    const r1 = await session.record(action);
    const r2 = await session.record(action);
    const r3 = await session.record(action);

    expect(r1.previousHash).toBe('0');
    expect(r2.previousHash).toBe(r1.hash);
    expect(r3.previousHash).toBe(r2.hash);
    expect(session.getReceipts()).toHaveLength(3);
  });

  it('double end() does not crash', () => {
    const { session } = makeSession();
    const info1 = session.end();
    const info2 = session.end();
    expect(info1.status).toBe('closed');
    expect(info2.status).toBe('closed');
  });

  it('end() is idempotent for status and close callback side effects', () => {
    const onClose = vi.fn().mockResolvedValue(undefined);
    const { session } = makeSession({ onCloseSession: onClose });

    const info1 = session.end('closed');
    const info2 = session.end('tampered');

    expect(info1.status).toBe('closed');
    expect(info2.status).toBe('closed');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(session.id, 'closed', '0');
  });

  it('end("tampered") sets status to tampered', () => {
    const { session } = makeSession();
    const info = session.end('tampered');
    expect(info.status).toBe('tampered');
  });

  // --- Wrap Edge Cases ---

  it('wrap() with async fn', async () => {
    const { session } = makeSession();
    const { result, receipt } = await session.wrap(
      { action: 'async-op', input: { n: 1 } },
      async () => ({ value: 'async-result' }),
    );
    expect(result).toEqual({ value: 'async-result' });
    expect(receipt.action).toBe('async-op');
  });

  it('wrap() where fn returns a primitive number stores { value: number }', async () => {
    const { session } = makeSession();
    const { result, receipt } = await session.wrap(
      { action: 'compute', input: {} },
      () => 42,
    );
    expect(result).toBe(42);
    expect(receipt.output).toEqual({ value: 42 });
  });

  it('wrap() on closed session throws', async () => {
    const { session } = makeSession();
    session.end();
    await expect(
      session.wrap({ action: 'late', input: {} }, () => 'nope'),
    ).rejects.toThrow(/closed/);
  });

  it('wrap() with policy returning { allowed: true } proceeds', async () => {
    const { session } = makeSession();
    const { result } = await session.wrap(
      { action: 'allowed-op', input: {} },
      () => ({ ok: true }),
      () => ({ allowed: true as const }),
    );
    expect(result).toEqual({ ok: true });
  });

  // --- Session Identity ---

  it('existingSessionId parameter is used', () => {
    const enqueue = vi.fn();
    const session = new Session(
      'test-agent',
      'test-session',
      privKeyHex,
      enqueue,
      undefined,
      undefined,
      undefined,
      'custom-session-id',
    );
    expect(session.id).toBe('custom-session-id');
  });

  it('info() reflects state changes through lifecycle', async () => {
    const { session } = makeSession();

    const infoBefore = session.info();
    expect(infoBefore.status).toBe('open');
    expect(infoBefore.receiptCount).toBe(0);

    await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    const infoAfterRecord = session.info();
    expect(infoAfterRecord.status).toBe('open');
    expect(infoAfterRecord.receiptCount).toBe(1);

    session.end();
    const infoAfterEnd = session.info();
    expect(infoAfterEnd.status).toBe('closed');
    expect(infoAfterEnd.receiptCount).toBe(1);
  });

  // --- Verification ---

  it('verify() on empty session returns valid with receiptCount 0', async () => {
    const { session } = makeSession();
    const result = await session.verify();
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(0);
  });

  // --- No-crypto sessions ---

  it('session without privateKey produces null signatures', async () => {
    const enqueue = vi.fn();
    const session = new Session('test-agent', 'no-crypto', null, enqueue);
    const r1 = await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    expect(r1.signature).toBeNull();
    expect(r1.hash).toBeTruthy();
    expect(r1.previousHash).toBe('0');
  });

  it('full lifecycle without crypto: record, chain, end', async () => {
    const enqueue = vi.fn();
    const session = new Session('test-agent', 'no-crypto', null, enqueue);
    const r1 = await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    const r2 = await session.record({ agent: 'test-agent', action: 'step', input: { x: 2 } });
    const r3 = await session.record({ agent: 'test-agent', action: 'step', input: { x: 3 } });

    expect(r1.previousHash).toBe('0');
    expect(r2.previousHash).toBe(r1.hash);
    expect(r3.previousHash).toBe(r2.hash);
    expect(r1.signature).toBeNull();
    expect(r2.signature).toBeNull();
    expect(r3.signature).toBeNull();

    const info = session.end();
    expect(info.status).toBe('closed');
    expect(info.receiptCount).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(3);
  });

  it('verify() on no-crypto session returns valid (hash chain only)', async () => {
    const enqueue = vi.fn();
    const session = new Session('test-agent', 'no-crypto', null, enqueue);
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 2 } });
    const result = await session.verify();
    expect(result.valid).toBe(true);
    expect(result.receiptCount).toBe(2);
  });

  it('wrap() works without crypto', async () => {
    const enqueue = vi.fn();
    const session = new Session('test-agent', 'no-crypto', null, enqueue);
    const { result, receipt } = await session.wrap(
      { action: 'compute', input: { n: 42 } },
      () => ({ answer: 42 }),
    );
    expect(result).toEqual({ answer: 42 });
    expect(receipt.signature).toBeNull();
    expect(receipt.hash).toBeTruthy();
  });

  it('Session.create() works without crypto', async () => {
    const enqueue = vi.fn();
    const session = await Session.create('test-agent', 'no-crypto', null, enqueue);
    const receipt = await session.record({ agent: 'test-agent', action: 'step', input: {} });
    expect(receipt.signature).toBeNull();
    expect(receipt.hash).toBeTruthy();
  });

  it('verify() detects tampered receipt', async () => {
    const { session } = makeSession();
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 1 } });
    await session.record({ agent: 'test-agent', action: 'step', input: { x: 2 } });

    // Tamper with internal receipts array
    const receipts = (session as any).receipts as Array<{ hash: string }>;
    receipts[0]!.hash = 'tampered-hash';

    const result = await session.verify();
    expect(result.valid).toBe(false);
  });
});
