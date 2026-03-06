import type { InvarianceTracer } from '../tracer.js';

/**
 * AutoGen middleware adapter for Invariance observability.
 *
 * @example
 * ```ts
 * import { InvarianceAutoGenMiddleware } from '@invariance/sdk/adapters/autogen'
 * const middleware = new InvarianceAutoGenMiddleware(invariance.tracer, 'session-123')
 * ```
 */
export class InvarianceAutoGenMiddleware {
  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;

  constructor(tracer: InvarianceTracer, sessionId: string) {
    this.tracer = tracer;
    this.sessionId = sessionId;
  }

  onMessage(sender: string, _receiver: string, _content: string): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: '',
      candidates: [],
      chosen: sender,
      depth: 0,
    });
  }

  onToolCall(_agentId: string, toolName: string, _args: unknown): void {
    this.tracer.emit('ToolInvocation', {
      nodeId: '',
      tool: toolName,
      inputHash: '',
      outputHash: '',
      latencyMs: 0,
    });
  }

  onGroupChatStart(agents: string[]): void {
    for (const agentId of agents) {
      this.tracer.emit('SubAgentSpawn', {
        parentNodeId: '',
        childAgentId: agentId,
        depth: 0,
      });
    }
  }
}
