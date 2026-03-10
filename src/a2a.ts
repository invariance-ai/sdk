import { ulid } from 'ulid';
import * as ed25519 from '@noble/ed25519';
import type { Receipt } from './types.js';
import { sortedStringify, sha256, ed25519Sign, hexToBytes } from './receipt.js';
import { Session } from './session.js';
import { fetchWithAuth } from './http.js';

/**
 * Envelope wrapping an agent-to-agent message with sender signature and trace metadata.
 */
export interface A2AEnvelope {
  payload: unknown;
  sender: string;
  receiver: string;
  timestamp: string;
  sender_signature: string;
  payload_hash: string;
  trace_node_id: string;
  session_id: string;
}

/**
 * A2AChannel instruments agent-to-agent communication with dual signatures.
 * Both sender and receiver produce signed receipts, creating a bilateral proof of communication.
 *
 * Protocol-agnostic — wraps MCP, A2A, CrewAI, LangChain, raw HTTP.
 */
export class A2AChannel {
  private readonly session: Session;
  private readonly agentIdentity: string;
  private readonly privateKey: string;
  private readonly apiUrl?: string;
  private readonly apiKey?: string;

  constructor(
    session: Session,
    agentIdentity: string,
    privateKey: string,
    opts?: { apiUrl?: string; apiKey?: string },
  ) {
    this.session = session;
    this.agentIdentity = agentIdentity;
    this.privateKey = privateKey;
    this.apiUrl = opts?.apiUrl;
    this.apiKey = opts?.apiKey;
  }

  /**
   * Wrap an outgoing message with sender signature and trace metadata.
   * Call this before sending a message to another agent.
   */
  async wrapOutgoing(to: string, payload: unknown, metadata?: Record<string, unknown>): Promise<{
    envelope: A2AEnvelope;
    receipt: Receipt;
  }> {
    const timestamp = new Date().toISOString();
    const payloadHash = await sha256(sortedStringify(payload));
    const traceNodeId = ulid();

    // Sign hash(payload + sender + receiver + timestamp)
    const sigInput = await sha256(sortedStringify({
      payload_hash: payloadHash,
      sender: this.agentIdentity,
      receiver: to,
      timestamp,
    }));
    const senderSignature = await ed25519Sign(sigInput, this.privateKey);

    // Record a receipt for the send action
    const receipt = await this.session.record({
      agent: this.agentIdentity,
      action: 'a2a_send',
      input: {
        to,
        payload_hash: payloadHash,
        trace_node_id: traceNodeId,
        ...(metadata ?? {}),
      },
      output: {
        envelope_signature: senderSignature,
      },
    });

    const envelope: A2AEnvelope = {
      payload,
      sender: this.agentIdentity,
      receiver: to,
      timestamp,
      sender_signature: senderSignature,
      payload_hash: payloadHash,
      trace_node_id: traceNodeId,
      session_id: this.session.id,
    };

    return { envelope, receipt };
  }

  /**
   * Wrap an incoming message — verify sender signature and counter-sign.
   * Call this when receiving a message from another agent.
   */
  async wrapIncoming(envelope: A2AEnvelope, senderPublicKey?: string): Promise<{
    payload: unknown;
    verified: boolean;
    receipt: Receipt;
  }> {
    let verified = false;

    // Resolve sender public key
    let pubKey = senderPublicKey;
    if (!pubKey && this.apiUrl && this.apiKey) {
      pubKey = await this.fetchAgentPublicKey(envelope.sender);
    }

    if (pubKey) {
      try {
        // Recompute the signed data
        const payloadHash = await sha256(sortedStringify(envelope.payload));

        // Verify payload hash matches
        if (payloadHash !== envelope.payload_hash) {
          verified = false;
        } else {
          const sigInput = await sha256(sortedStringify({
            payload_hash: payloadHash,
            sender: envelope.sender,
            receiver: envelope.receiver,
            timestamp: envelope.timestamp,
          }));

          const sigBytes = hexToBytes(envelope.sender_signature);
          const msgBytes = new TextEncoder().encode(sigInput);
          const pubKeyBytes = hexToBytes(pubKey);
          verified = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
        }
      } catch {
        verified = false;
      }
    }

    // Record a receipt for the receive action with counter-signature
    const counterSigInput = await sha256(sortedStringify({
      payload_hash: envelope.payload_hash,
      sender: envelope.sender,
      receiver: this.agentIdentity,
      timestamp: envelope.timestamp,
      sender_signature: envelope.sender_signature,
    }));
    const counterSignature = await ed25519Sign(counterSigInput, this.privateKey);

    const receipt = await this.session.record({
      agent: this.agentIdentity,
      action: 'a2a_receive',
      input: {
        from: envelope.sender,
        payload_hash: envelope.payload_hash,
        trace_node_id: envelope.trace_node_id,
        verified,
      },
      output: {
        counter_signature: counterSignature,
      },
    });

    // Attach counter-party metadata to receipt
    (receipt as Receipt & { counterAgentId?: string }).counterAgentId = envelope.sender;
    (receipt as Receipt & { counterSignature?: string }).counterSignature = counterSignature;

    return { payload: envelope.payload, verified, receipt };
  }

  private async fetchAgentPublicKey(agentId: string): Promise<string | undefined> {
    if (!this.apiUrl || !this.apiKey) return undefined;
    try {
      const res = await fetchWithAuth(
        this.apiUrl,
        this.apiKey,
        `/v1/agents/${encodeURIComponent(agentId)}`,
      );
      if (!res.ok) return undefined;
      const data = await res.json() as { public_key?: string };
      return data.public_key;
    } catch {
      return undefined;
    }
  }
}
