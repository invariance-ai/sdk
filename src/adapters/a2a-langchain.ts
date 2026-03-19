import type { A2AChannel } from '../a2a.js';

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
 * Records the outbound handoff, but does not fabricate a remote response
 * receipt because LangChain tools do not return signed A2A envelopes.
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
    // Record the outbound handoff with adapter metadata.
    await opts.channel.wrapOutgoing(
      opts.receiverAgent,
      { input },
      { protocol: 'langchain', adapter: 'langchain_tool' },
    );

    // Execute the tool
    const result = await original(input);

    return result;
  };

  return tool;
}
