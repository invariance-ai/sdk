import type { A2AChannel, A2AEnvelope } from '../a2a.js';

/**
 * Create a fetch wrapper that auto-signs outgoing HTTP requests
 * and verifies incoming responses using A2AChannel.
 *
 * Simplest integration path for raw HTTP agent communication.
 */
export function createInstrumentedFetch(
  channel: A2AChannel,
  receiverAgent: string,
  opts?: { senderPublicKey?: string },
): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // Extract body as payload
    let payload: unknown = null;
    if (init?.body) {
      try {
        payload = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as ArrayBuffer));
      } catch {
        payload = { raw: typeof init.body === 'string' ? init.body : '<binary>' };
      }
    }

    // Wrap outgoing
    const { envelope } = await channel.wrapOutgoing(receiverAgent, payload);

    // Attach envelope metadata as headers
    const headers = new Headers(init?.headers);
    headers.set('X-A2A-Sender', envelope.sender);
    headers.set('X-A2A-Receiver', envelope.receiver);
    headers.set('X-A2A-Signature', envelope.sender_signature);
    headers.set('X-A2A-Payload-Hash', envelope.payload_hash);
    headers.set('X-A2A-Timestamp', envelope.timestamp);
    headers.set('X-A2A-Trace-Node-Id', envelope.trace_node_id);
    headers.set('X-A2A-Session-Id', envelope.session_id);

    // Make the actual request
    const response = await fetch(input, { ...init, headers });

    // Wrap response as incoming if it contains A2A headers
    const responseSender = response.headers.get('X-A2A-Sender');
    if (responseSender && response.headers.get('X-A2A-Signature')) {
      let responsePayload: unknown = null;
      try {
        responsePayload = await response.clone().json();
      } catch {
        responsePayload = await response.clone().text();
      }

      const responseEnvelope: A2AEnvelope = {
        payload: responsePayload,
        sender: responseSender,
        receiver: envelope.sender,
        timestamp: response.headers.get('X-A2A-Timestamp') ?? new Date().toISOString(),
        sender_signature: response.headers.get('X-A2A-Signature') ?? '',
        payload_hash: response.headers.get('X-A2A-Payload-Hash') ?? '',
        trace_node_id: response.headers.get('X-A2A-Trace-Node-Id') ?? '',
        session_id: response.headers.get('X-A2A-Session-Id') ?? envelope.session_id,
      };

      await channel.wrapIncoming(responseEnvelope, opts?.senderPublicKey);
    }

    return response;
  };
}
