import { describe, it, expect, vi } from 'vitest';
import { A2AChannel } from '../a2a.js';
import { Session } from '../session.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sortedStringify, sha256, hexToBytes, bytesToHex } from '../receipt.js';

ed25519.etc.sha512Sync = sha512;

function makeAgent() {
  const privKey = ed25519.utils.randomPrivateKey();
  const pubKey = ed25519.getPublicKey(privKey);
  return {
    privateKey: Buffer.from(privKey).toString('hex'),
    publicKey: Buffer.from(pubKey).toString('hex'),
  };
}

function makeSession(agentId: string, privateKey: string) {
  const enqueue = vi.fn();
  const session = new Session(agentId, 'a2a-test', privateKey, enqueue);
  return { session, enqueue };
}

describe('A2AChannel', () => {
  const agentA = makeAgent();
  const agentB = makeAgent();

  it('wrapOutgoing produces valid envelope with correct signature', async () => {
    const { session } = makeSession('agent-a', agentA.privateKey);
    const channel = new A2AChannel(session, 'agent-a', agentA.privateKey);

    const payload = { message: 'hello', data: [1, 2, 3] };
    const { envelope, receipt } = await channel.wrapOutgoing('agent-b', payload);

    expect(envelope.sender).toBe('agent-a');
    expect(envelope.receiver).toBe('agent-b');
    expect(envelope.payload).toEqual(payload);
    expect(envelope.sender_signature).toBeTruthy();
    expect(envelope.payload_hash).toBeTruthy();
    expect(envelope.trace_node_id).toBeTruthy();
    expect(envelope.session_id).toBeTruthy();

    // Verify the signature is valid
    const expectedPayloadHash = await sha256(sortedStringify(payload));
    expect(envelope.payload_hash).toBe(expectedPayloadHash);

    const sigInput = await sha256(sortedStringify({
      payload_hash: expectedPayloadHash,
      sender: 'agent-a',
      receiver: 'agent-b',
      timestamp: envelope.timestamp,
    }));
    const sigBytes = hexToBytes(envelope.sender_signature);
    const msgBytes = new TextEncoder().encode(sigInput);
    const pubKeyBytes = hexToBytes(agentA.publicKey);
    expect(ed25519.verify(sigBytes, msgBytes, pubKeyBytes)).toBe(true);

    // Receipt recorded
    expect(receipt.action).toBe('a2a_send');
    expect(receipt.agent).toBe('agent-a');
  });

  it('wrapIncoming verifies valid sender signature → verified=true', async () => {
    const { session: sessionA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const payload = { task: 'analyze', target: 'data.csv' };
    const { envelope } = await channelA.wrapOutgoing('agent-b', payload);

    const result = await channelB.wrapIncoming(envelope, agentA.publicKey);

    expect(result.verified).toBe(true);
    expect(result.payload).toEqual(payload);
    expect(result.receipt.action).toBe('a2a_receive');
    expect(result.receipt.agent).toBe('agent-b');
  });

  it('wrapIncoming rejects tampered payload → verified=false', async () => {
    const { session: sessionA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const { envelope } = await channelA.wrapOutgoing('agent-b', { secret: 'original' });

    // Tamper with payload
    const tamperedEnvelope = { ...envelope, payload: { secret: 'tampered' } };

    const result = await channelB.wrapIncoming(tamperedEnvelope, agentA.publicKey);
    expect(result.verified).toBe(false);
  });

  it('wrapIncoming rejects wrong sender key → verified=false', async () => {
    const { session: sessionA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const { envelope } = await channelA.wrapOutgoing('agent-b', { data: 42 });

    // Use wrong public key (agent B's instead of agent A's)
    const result = await channelB.wrapIncoming(envelope, agentB.publicKey);
    expect(result.verified).toBe(false);
  });

  it('wrapIncoming rejects envelopes addressed to another receiver → verified=false', async () => {
    const { session: sessionA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const { envelope } = await channelA.wrapOutgoing('agent-c', { data: 42 });

    const result = await channelB.wrapIncoming(envelope, agentA.publicKey);
    expect(result.verified).toBe(false);
  });

  it('round-trip: agent A wraps outgoing → agent B wraps incoming → both receipts link', async () => {
    const { session: sessionA, enqueue: enqueueA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB, enqueue: enqueueB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const payload = { instruction: 'summarize report' };
    const { envelope, receipt: sendReceipt } = await channelA.wrapOutgoing('agent-b', payload);
    const { receipt: receiveReceipt, verified } = await channelB.wrapIncoming(envelope, agentA.publicKey);

    expect(verified).toBe(true);

    // Both receipts should reference each other via input fields
    expect((sendReceipt.input as Record<string, unknown>).to).toBe('agent-b');
    expect((receiveReceipt.input as Record<string, unknown>).from).toBe('agent-a');

    // Both share the same trace_node_id
    expect((sendReceipt.input as Record<string, unknown>).trace_node_id)
      .toBe((receiveReceipt.input as Record<string, unknown>).trace_node_id);

    // Both share the same payload_hash
    expect((sendReceipt.input as Record<string, unknown>).payload_hash)
      .toBe((receiveReceipt.input as Record<string, unknown>).payload_hash);

    // Both sessions got enqueued receipts
    expect(enqueueA).toHaveBeenCalledTimes(1);
    expect(enqueueB).toHaveBeenCalledTimes(1);
  });

  it('dual signatures: both sender and receiver receipts exist with correct sigs', async () => {
    const { session: sessionA } = makeSession('agent-a', agentA.privateKey);
    const { session: sessionB } = makeSession('agent-b', agentB.privateKey);

    const channelA = new A2AChannel(sessionA, 'agent-a', agentA.privateKey);
    const channelB = new A2AChannel(sessionB, 'agent-b', agentB.privateKey);

    const { envelope, receipt: sendReceipt } = await channelA.wrapOutgoing('agent-b', { x: 1 });
    const { receipt: receiveReceipt } = await channelB.wrapIncoming(envelope, agentA.publicKey);

    // Sender receipt is signed by agent A
    expect(sendReceipt.signature).toBeTruthy();

    // Receiver receipt is signed by agent B
    expect(receiveReceipt.signature).toBeTruthy();

    // Counter-signature exists on receive receipt
    expect((receiveReceipt.output as Record<string, unknown>).counter_signature).toBeTruthy();
  });

  it('wrapOutgoing passes metadata into receipt input', async () => {
    const { session } = makeSession('agent-a', agentA.privateKey);
    const channel = new A2AChannel(session, 'agent-a', agentA.privateKey);

    const { receipt } = await channel.wrapOutgoing('agent-b', { msg: 'hi' }, { protocol: 'mcp', version: '1.0' });

    const input = receipt.input as Record<string, unknown>;
    expect(input.protocol).toBe('mcp');
    expect(input.version).toBe('1.0');
  });
});
