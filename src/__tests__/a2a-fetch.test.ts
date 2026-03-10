import { describe, it, expect, vi, beforeEach } from 'vitest';
import { A2AChannel } from '../a2a.js';
import { createInstrumentedFetch } from '../adapters/a2a-fetch.js';
import { Session } from '../session.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

function makeAgent() {
  const privKey = ed25519.utils.randomPrivateKey();
  const pubKey = ed25519.getPublicKey(privKey);
  return {
    privateKey: Buffer.from(privKey).toString('hex'),
    publicKey: Buffer.from(pubKey).toString('hex'),
  };
}

describe('createInstrumentedFetch', () => {
  const agentA = makeAgent();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-wraps request with A2A headers', async () => {
    const enqueue = vi.fn();
    const session = new Session('agent-a', 'fetch-test', agentA.privateKey, enqueue);
    const channel = new A2AChannel(session, 'agent-a', agentA.privateKey);

    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const instrumentedFetch = createInstrumentedFetch(channel, 'agent-b');

    await instrumentedFetch('https://agent-b.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ task: 'analyze' }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, requestInit] = mockFetch.mock.calls[0];
    const headers = new Headers(requestInit.headers);

    expect(headers.get('X-A2A-Sender')).toBe('agent-a');
    expect(headers.get('X-A2A-Receiver')).toBe('agent-b');
    expect(headers.get('X-A2A-Signature')).toBeTruthy();
    expect(headers.get('X-A2A-Payload-Hash')).toBeTruthy();
    expect(headers.get('X-A2A-Timestamp')).toBeTruthy();
    expect(headers.get('X-A2A-Trace-Node-Id')).toBeTruthy();
    expect(headers.get('X-A2A-Session-Id')).toBeTruthy();

    // Should have recorded a send receipt
    expect(enqueue).toHaveBeenCalledTimes(1);
    const receipt = enqueue.mock.calls[0][0];
    expect(receipt.action).toBe('a2a_send');
  });

  it('auto-verifies response with A2A headers', async () => {
    const enqueue = vi.fn();
    const session = new Session('agent-a', 'fetch-test', agentA.privateKey, enqueue);
    const channel = new A2AChannel(session, 'agent-a', agentA.privateKey);

    // Mock fetch that returns A2A headers (simulating an instrumented server)
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'done' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Sender': 'agent-b',
        'X-A2A-Signature': 'abcd'.repeat(32), // 128 char fake sig
        'X-A2A-Payload-Hash': 'hash123',
        'X-A2A-Timestamp': new Date().toISOString(),
        'X-A2A-Trace-Node-Id': 'node123',
        'X-A2A-Session-Id': session.id,
      },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const instrumentedFetch = createInstrumentedFetch(channel, 'agent-b');

    await instrumentedFetch('https://agent-b.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ task: 'analyze' }),
    });

    // Should have recorded both send and receive receipts
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0].action).toBe('a2a_send');
    expect(enqueue.mock.calls[1][0].action).toBe('a2a_receive');
  });
});
