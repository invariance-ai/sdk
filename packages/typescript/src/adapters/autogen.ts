import type { Invariance } from '../client.js';
import type { Session } from '../session.js';
import { buildTraceEvent, buildToolInvocationEvent } from '../trace-builders.js';

interface AutoGenAdapterOpts {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * AutoGen adapter that records multi-agent conversations as Invariance receipts
 * and trace events with proper behavioral primitives (a2a_send for messages,
 * tool_invocation for function calls).
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

  /** Record an inter-agent message as an a2a_send trace event. */
  async onMessageSent(from: string, to: string, content: string): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'autogen_message',
      input: { from, to, content },
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: from,
      action_type: 'a2a_send',
      input: { to, content },
    })]);
  }

  /** Record a function call as a tool_invocation trace event. */
  async onFunctionCall(caller: string, functionName: string, args: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'autogen_function_call',
      input: { caller, function: functionName, arguments: args } as Record<string, unknown>,
    });
    await this.client.tracing.submit([buildToolInvocationEvent({
      session_id: session.id,
      agent_id: caller,
      tool: functionName,
      args,
    })]);
  }

  async onFunctionResult(functionName: string, result: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'autogen_function_result',
      input: { function: functionName },
      output: { result } as Record<string, unknown>,
    });
  }

  async onConversationEnd(summary?: string): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'autogen_conversation_end',
      input: { summary: summary ?? '' },
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: 'conversation_end', summary },
    })]);
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
