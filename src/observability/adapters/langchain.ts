import type { InvarianceTracer } from '../tracer.js';

/**
 * LangChain callback adapter for Invariance observability.
 *
 * @example
 * ```ts
 * import { InvarianceLangChainTracer } from '@invariance/sdk/adapters/langchain'
 * const tracer = new InvarianceLangChainTracer(invariance.tracer, 'session-123')
 * // Pass as callback to LangChain
 * ```
 */
export class InvarianceLangChainTracer {
  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;

  constructor(tracer: InvarianceTracer, sessionId: string) {
    this.tracer = tracer;
    this.sessionId = sessionId;
  }

  handleLLMStart(_llm: unknown, prompts: string[]): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: '',
      candidates: prompts,
      chosen: prompts[0] ?? '',
      depth: 0,
    });
  }

  handleToolStart(tool: { name: string }, input: string): void {
    this.tracer.emit('ToolInvocation', {
      nodeId: '',
      tool: tool.name,
      inputHash: input,
      outputHash: '',
      latencyMs: 0,
    });
  }

  handleChainError(error: Error): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: '',
      candidates: [],
      chosen: `error: ${error.message}`,
      depth: 0,
    });
  }
}
