import type { Invariance } from '../client.js';
import type { Session } from '../session.js';
import { buildTraceEvent, buildToolInvocationEvent, buildHandoffEvent } from '../trace-builders.js';

interface CrewAIAdapterOpts {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * CrewAI adapter that records crew task executions as Invariance receipts
 * and trace events with proper behavioral primitives.
 */
export class InvarianceCrewAIAdapter {
  private client: Invariance;
  private agent: string;
  private session: Session | null = null;
  private sessionName: string;

  constructor(opts: CrewAIAdapterOpts) {
    this.client = opts.client;
    this.agent = opts.agent;
    this.sessionName = opts.sessionName ?? 'crewai-run';
  }

  private getSession(): Session {
    if (!this.session) {
      this.session = this.client.session({ agent: this.agent, name: this.sessionName });
    }
    return this.session;
  }

  async onTaskStart(task: { description?: string; agent?: string }): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'crew_task_start',
      input: { description: task.description, assigned_agent: task.agent },
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: 'crew_task_start', description: task.description, assigned_agent: task.agent },
    })]);
  }

  async onTaskEnd(task: { description?: string }, output: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'crew_task_end',
      input: { description: task.description },
      output: { result: output } as Record<string, unknown>,
    });
    await this.client.tracing.submit([buildTraceEvent({
      session_id: session.id,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: 'crew_task_end', description: task.description },
      output: typeof output === 'object' ? output : { result: output },
    })]);
  }

  async onToolUse(tool: string, input: unknown, output: unknown): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'crew_tool_use',
      input: { tool, tool_input: input } as Record<string, unknown>,
      output: { result: output } as Record<string, unknown>,
    });
    await this.client.tracing.submit([buildToolInvocationEvent({
      session_id: session.id,
      agent_id: this.agent,
      tool,
      args: input,
      result: output,
    })]);
  }

  /** Record a CrewAI delegation as a handoff (sub_agent_spawn) trace event. */
  async onDelegation(from: string, to: string, task: string): Promise<void> {
    const session = this.getSession();
    await session.record({
      action: 'crew_delegation',
      input: { from, to, task },
    });
    await this.client.tracing.submit([buildHandoffEvent({
      session_id: session.id,
      agent_id: from,
      target_agent_id: to,
      task,
    })]);
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
