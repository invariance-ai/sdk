import type { A2AChannel, A2AEnvelope } from '../a2a.js';

/**
 * Options for wrapping a LangChain tool with A2A instrumentation.
 */
export interface A2ALangChainToolOptions {
  /** The A2A channel for this agent */
  channel: A2AChannel;
  /** The receiving agent's identity */
  receiverAgent: string;
  /** Optional sender public key for verification */
  senderPublicKey?: string;
}

/**
 * Wrap a LangChain-style tool's _call method with A2A instrumentation.
 * Intercepts outgoing calls and signs them, captures responses.
 *
 * Works with any object that has a `_call(input: string)` method (LangChain Tool pattern).
 *
 * @example
 * ```ts
 * const tool = new MyLangChainTool();
 * const wrapped = wrapLangChainTool(tool, {
 *   channel,
 *   receiverAgent: 'agent-b',
 * });
 * const result = await wrapped._call('some input');
 * ```
 */
export function wrapLangChainTool<T extends { _call(input: string): Promise<string> }>(
  tool: T,
  opts: A2ALangChainToolOptions,
): T {
  const original = tool._call.bind(tool);

  tool._call = async (input: string): Promise<string> => {
    // Wrap outgoing
    const { envelope } = await opts.channel.wrapOutgoing(opts.receiverAgent, { input });

    // Execute the tool
    const result = await original(input);

    // Wrap the response as incoming (the receiver's response)
    const responseEnvelope: A2AEnvelope = {
      payload: { output: result },
      sender: opts.receiverAgent,
      receiver: envelope.sender,
      timestamp: new Date().toISOString(),
      sender_signature: '', // Response isn't signed by remote in this adapter
      payload_hash: '',
      trace_node_id: envelope.trace_node_id,
      session_id: envelope.session_id,
    };

    // Record the incoming receipt (verification will be false since response isn't signed)
    await opts.channel.wrapIncoming(responseEnvelope, opts.senderPublicKey);

    return result;
  };

  return tool;
}
