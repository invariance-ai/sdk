import type { Invariance } from '../client.js';
import type { Session } from '../session.js';

interface AutoGenAdapterOpts {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * AutoGen adapter that records multi-agent conversations as Invariance receipts.
 */
export class InvarianceAutoGenAdapter {
  private client: Invariance;
  private agent: string;
  private session: Session | null = null;
  private sessionName: string;

  constructor(opts: AutoGenAdapterOpts) {
    this.client = opts.client;
    this.agent = opts.agent;
    this.sessionName = opts.sessionName ?? 'autogen-run';
  }

  private getSession(): Session {
    if (!this.session) {
      this.session = this.client.session({ agent: this.agent, name: this.sessionName });
    }
    return this.session;
  }

  async onMessageSent(from: string, to: string, content: string): Promise<void> {
    await this.getSession().record({
      action: 'autogen_message',
      input: { from, to, content },
    });
  }

  async onFunctionCall(caller: string, functionName: string, args: unknown): Promise<void> {
    await this.getSession().record({
      action: 'autogen_function_call',
      input: { caller, function: functionName, arguments: args } as Record<string, unknown>,
    });
  }

  async onFunctionResult(functionName: string, result: unknown): Promise<void> {
    await this.getSession().record({
      action: 'autogen_function_result',
      input: { function: functionName },
      output: { result } as Record<string, unknown>,
    });
  }

  async onConversationEnd(summary?: string): Promise<void> {
    await this.getSession().record({
      action: 'autogen_conversation_end',
      input: { summary: summary ?? '' },
    });
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
