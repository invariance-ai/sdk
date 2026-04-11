import type { Invariance } from '../client.js';
import type { Session } from '../session.js';
import { buildTraceEvent, buildToolInvocationEvent } from '../trace-builders.js';

interface LangChainCallbackHandlerInput {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * LangChain callback handler that records tool calls and LLM invocations
 * as Invariance receipts and trace events with proper behavioral primitives.
 */
export class InvarianceLangChainHandler {
  private client: Invariance;
  private agent: string;
  private session: Session | null = null;
  private sessionName: string;
  private activeTool: { name: string; input: string; startedAt: number } | null = null;

  constructor(opts: LangChainCallbackHandlerInput) {
    this.client = opts.client;
    this.agent = opts.agent;
    this.sessionName = opts.sessionName ?? 'langchain-run';
  }

  private getSession(): Session {
    if (!this.session) {
      this.session = this.client.session({ agent: this.agent, name: this.sessionName });
    }
    return this.session;
  }

  async handleLLMStart(llm: { name?: string }, prompts: string[]): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'llm_start',
      input: { llm: llm.name, prompts },
    });
    // Emit trace event for context window tracking
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'context_window',
      input: { label: `llm:${llm.name ?? 'unknown'}`, model: llm.name ?? 'unknown', prompt_count: prompts.length },
    })]);
  }

  async handleLLMEnd(output: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'llm_end',
      input: {},
      output: { result: output } as Record<string, unknown>,
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: 'llm_end' },
      output: typeof output === 'object' ? output : { result: output },
    })]);
  }

  async handleToolStart(tool: { name?: string }, input: string): Promise<void> {
    const session = this.getSession();
    this.activeTool = { name: tool.name ?? 'unknown', input, startedAt: Date.now() };
    await session.record({
      action: 'tool_start',
      input: { tool: tool.name, input },
    });
    await this.client.tracing.submit([buildToolInvocationEvent({
      session_id: session.id,
      agent_id: this.agent,
      tool: tool.name ?? 'unknown',
      args: { input },
    })]);
  }

  async handleToolEnd(output: string): Promise<void> {
    const session = this.getSession();
    const activeTool = this.activeTool;
    this.activeTool = null;
    await session.record({
      action: 'tool_end',
      input: {},
      output: { result: output },
    });
    await this.client.tracing.submit([buildToolInvocationEvent({
      session_id: session.id,
      agent_id: this.agent,
      tool: activeTool?.name ?? 'unknown',
      args: activeTool ? { input: activeTool.input } : undefined,
      result: { result: output },
      latency_ms: activeTool ? Date.now() - activeTool.startedAt : undefined,
    })]);
  }

  async handleChainStart(chain: { name?: string }, inputs: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'chain_start',
      input: { chain: chain.name, inputs: inputs as Record<string, unknown> },
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: `chain:${chain.name ?? 'unknown'}`, inputs },
    })]);
  }

  async handleChainEnd(outputs: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'chain_end',
      input: {},
      output: { result: outputs } as Record<string, unknown>,
    });
  }

  async handleError(error: Error): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'error',
      input: {},
      error: error.message,
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: 'error' },
      error: error.message,
    })]);
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
