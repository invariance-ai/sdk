import { Session } from './session.js';
import { sortedStringify, sha256, ed25519Sign } from './crypto.js';
import type { Receipt } from './types/receipt.js';

export interface A2AChannelOpts {
  session: Session;
  identity: string;
  privateKey: string;
  counterAgentId: string;
  conversationId: string;
}

export class A2AChannel {
  private session: Session;
  readonly identity: string;
  private privateKey: string;
  private counterAgentId: string;
  private conversationId: string;

  constructor(opts: A2AChannelOpts) {
    this.session = opts.session;
    this.identity = opts.identity;
    this.privateKey = opts.privateKey;
    this.counterAgentId = opts.counterAgentId;
    this.conversationId = opts.conversationId;
  }

  async send(content: string, metadata?: Record<string, unknown>): Promise<Receipt> {
    const payloadHash = await sha256(sortedStringify({ content, metadata }));

    return this.session.record({
      action: 'a2a_send',
      input: {
        conversation_id: this.conversationId,
        to: this.counterAgentId,
        content,
        payload_hash: payloadHash,
        message_type: 'text',
        protocol: 'invariance-a2a',
        ...metadata,
      },
    });
  }

  async receive(
    content: string,
    senderSignature: string,
    metadata?: Record<string, unknown>,
  ): Promise<Receipt> {
    const payloadHash = await sha256(sortedStringify({ content, metadata }));
    const counterSignature = await ed25519Sign(payloadHash, this.privateKey);

    return this.session.record({
      action: 'a2a_receive',
      input: {
        conversation_id: this.conversationId,
        from: this.counterAgentId,
        content,
        payload_hash: payloadHash,
        sender_signature: senderSignature,
        counter_signature: counterSignature,
        message_type: 'text',
        protocol: 'invariance-a2a',
        ...metadata,
      },
    });
  }
}
