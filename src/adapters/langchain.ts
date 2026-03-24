import type { Invariance } from '../client.js';
import type { Session } from '../session.js';

interface LangChainCallbackHandlerInput {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * LangChain callback handler that records tool calls and LLM invocations
 * as Invariance receipts.
 */
export class InvarianceLangChainHandler {
  private client: Invariance;
  private agent: string;
  private session: Session | null = null;
  private sessionName: string;

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
    await this.getSession().record({
      action: 'llm_start',
      input: { llm: llm.name, prompts },
    });
  }

  async handleLLMEnd(output: unknown): Promise<void> {
    await this.getSession().record({
      action: 'llm_end',
      input: {},
      output: { result: output } as Record<string, unknown>,
    });
  }

  async handleToolStart(tool: { name?: string }, input: string): Promise<void> {
    await this.getSession().record({
      action: 'tool_start',
      input: { tool: tool.name, input },
    });
  }

  async handleToolEnd(output: string): Promise<void> {
    await this.getSession().record({
      action: 'tool_end',
      input: {},
      output: { result: output },
    });
  }

  async handleChainStart(chain: { name?: string }, inputs: unknown): Promise<void> {
    await this.getSession().record({
      action: 'chain_start',
      input: { chain: chain.name, inputs: inputs as Record<string, unknown> },
    });
  }

  async handleChainEnd(outputs: unknown): Promise<void> {
    await this.getSession().record({
      action: 'chain_end',
      input: {},
      output: { result: outputs } as Record<string, unknown>,
    });
  }

  async handleError(error: Error): Promise<void> {
    await this.getSession().record({
      action: 'error',
      input: {},
      error: error.message,
    });
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
