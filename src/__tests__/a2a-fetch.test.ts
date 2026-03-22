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
  const agentB = makeAgent();

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

  it('auto-verifies response with valid A2A headers', async () => {
    const enqueueA = vi.fn();
    const sessionA = new Session('agent-a', 'fetch-test', agentA.privateKey, enqueueA);
    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);

    const enqueueB = vi.fn();
    const sessionB = new Session('agent-b', 'fetch-test', agentB.privateKey, enqueueB);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);
    const { envelope: responseEnvelope } = await channelB.wrapOutgoing('agent-a', { result: 'done' });

    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseEnvelope.payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Sender': responseEnvelope.sender,
        'X-A2A-Signature': responseEnvelope.sender_signature,
        'X-A2A-Payload-Hash': responseEnvelope.payload_hash,
        'X-A2A-Timestamp': responseEnvelope.timestamp,
        'X-A2A-Trace-Node-Id': responseEnvelope.trace_node_id,
        'X-A2A-Session-Id': responseEnvelope.session_id,
      },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const instrumentedFetch = createInstrumentedFetch(channelA, 'agent-b', {
      senderPublicKey: agentB.publicKey,
    });

    await instrumentedFetch('https://agent-b.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ task: 'analyze' }),
    });

    expect(enqueueA).toHaveBeenCalledTimes(2);
    expect(enqueueA.mock.calls[0][0].action).toBe('a2a_send');
    expect(enqueueA.mock.calls[1][0].action).toBe('a2a_receive');
    expect(enqueueA.mock.calls[1][0].input.verified).toBe(true);
    expect(enqueueA.mock.calls[1][0].counterSignature).toBeTruthy();
  });

  it('records unverified inbound responses when sender public key is unavailable', async () => {
    const enqueueA = vi.fn();
    const sessionA = new Session('agent-a', 'fetch-test', agentA.privateKey, enqueueA);
    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);

    const enqueueB = vi.fn();
    const sessionB = new Session('agent-b', 'fetch-test', agentB.privateKey, enqueueB);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);
    const { envelope: responseEnvelope } = await channelB.wrapOutgoing('agent-a', { result: 'done' });

    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseEnvelope.payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Sender': responseEnvelope.sender,
        'X-A2A-Signature': responseEnvelope.sender_signature,
        'X-A2A-Payload-Hash': responseEnvelope.payload_hash,
        'X-A2A-Timestamp': responseEnvelope.timestamp,
        'X-A2A-Trace-Node-Id': responseEnvelope.trace_node_id,
        'X-A2A-Session-Id': responseEnvelope.session_id,
      },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const instrumentedFetch = createInstrumentedFetch(channelA, 'agent-b');

    await instrumentedFetch('https://agent-b.example.com/api', {
      method: 'POST',
      body: JSON.stringify({ task: 'analyze' }),
    });

    expect(enqueueA).toHaveBeenCalledTimes(2);
    expect(enqueueA.mock.calls[1][0].action).toBe('a2a_receive');
    expect(enqueueA.mock.calls[1][0].input.verified).toBe(false);
    expect(enqueueA.mock.calls[1][0].input.verification_error).toBe('missing_sender_public_key');
    expect(enqueueA.mock.calls[1][0].output.counter_signature).toBeUndefined();
  });
});
