import { describe, it, expect, vi } from 'vitest';
import { Session } from '../session.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

function makeSession(opts?: {
  onCreateSession?: Parameters<typeof Session['prototype']['constructor']>[4];
  onCloseSession?: Parameters<typeof Session['prototype']['constructor']>[5];
}) {
  const enqueue = vi.fn();
  const session = new Session(
    'test-agent',
    'test-session',
    privKeyHex,
    enqueue,
    opts?.onCreateSession,
    opts?.onCloseSession,
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
});
