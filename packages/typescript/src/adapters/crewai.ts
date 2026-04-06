import type { Invariance } from '../client.js';
import type { Session } from '../session.js';

interface CrewAIAdapterOpts {
  client: Invariance;
  agent: string;
  sessionName?: string;
}

/**
 * CrewAI adapter that records crew task executions as Invariance receipts.
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
    await this.getSession().record({
      action: 'crew_task_start',
      input: { description: task.description, assigned_agent: task.agent },
    });
  }

  async onTaskEnd(task: { description?: string }, output: unknown): Promise<void> {
    await this.getSession().record({
      action: 'crew_task_end',
      input: { description: task.description },
      output: { result: output } as Record<string, unknown>,
    });
  }

  async onToolUse(tool: string, input: unknown, output: unknown): Promise<void> {
    await this.getSession().record({
      action: 'crew_tool_use',
      input: { tool, tool_input: input } as Record<string, unknown>,
      output: { result: output } as Record<string, unknown>,
    });
  }

  async onDelegation(from: string, to: string, task: string): Promise<void> {
    await this.getSession().record({
      action: 'crew_delegation',
      input: { from, to, task },
    });
  }

  async end(): Promise<void> {
    if (this.session) {
      await this.session.end();
      this.session = null;
    }
  }
}
