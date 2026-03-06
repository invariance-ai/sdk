import type { InvarianceTracer } from '../tracer.js';

/**
 * CrewAI middleware adapter for Invariance observability.
 *
 * @example
 * ```ts
 * import { InvarianceCrewAIMiddleware } from '@invariance/sdk/adapters/crewai'
 * const middleware = new InvarianceCrewAIMiddleware(invariance.tracer, 'session-123')
 * ```
 */
export class InvarianceCrewAIMiddleware {
  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;

  constructor(tracer: InvarianceTracer, sessionId: string) {
    this.tracer = tracer;
    this.sessionId = sessionId;
  }

  onTaskStart(_taskName: string, agentId: string): void {
    this.tracer.emit('SubAgentSpawn', {
      parentNodeId: '',
      childAgentId: agentId,
      depth: 0,
    });
  }

  onTaskComplete(taskName: string, _agentId: string, _output: unknown): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: '',
      candidates: [taskName],
      chosen: taskName,
      depth: 0,
    });
  }

  onTaskError(taskName: string, _agentId: string, error: Error): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: '',
      candidates: [taskName],
      chosen: `error: ${error.message}`,
      depth: 0,
    });
  }
}
