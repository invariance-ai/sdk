import type { EvalResult, JudgeConfig, JudgeVerdict } from './eval-types.js';
import { TraceQuery } from './trace-query.js';
import type { Receipt } from './types.js';

type EvalFn = (query: TraceQuery) => void | Promise<void>;

interface EvalEntry {
  name: string;
  fn: EvalFn;
}

interface JudgeEntry {
  name: string;
  config: JudgeConfig;
}

export class EvalSuite {
  private evals: EvalEntry[] = [];
  private judges: JudgeEntry[] = [];

  /** Add a programmatic assertion eval */
  add(name: string, fn: EvalFn): this {
    this.evals.push({ name, fn });
    return this;
  }

  /** Add an LLM judge eval */
  addJudge(name: string, config: JudgeConfig): this {
    this.judges.push({ name, config });
    return this;
  }

  /** Run all evals against the given receipts */
  async run(receipts: readonly Receipt[]): Promise<EvalResult[]> {
    const query = new TraceQuery([...receipts]);
    const results: EvalResult[] = [];

    // Run programmatic evals
    for (const entry of this.evals) {
      const start = Date.now();
      try {
        await entry.fn(query);
        results.push({
          name: entry.name,
          passed: true,
          duration_ms: Date.now() - start,
        });
      } catch (err) {
        results.push({
          name: entry.name,
          passed: false,
          reason: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - start,
        });
      }
    }

    // Run LLM judges
    for (const judge of this.judges) {
      const start = Date.now();
      try {
        const traceData = receipts.map((r) => ({
          action: r.action,
          input: r.input,
          output: r.output,
          error: r.error,
        }));

        const fullPrompt = `${judge.config.prompt}\n\nTrace data:\n${JSON.stringify(traceData, null, 2)}\n\nRespond with JSON: {"score": <0-1>, "reasoning": "<explanation>"}`;
        const response = await judge.config.provider(fullPrompt);

        const verdict = this.parseJudgeResponse(response);
        results.push({
          name: judge.name,
          passed: verdict.score >= 0.5,
          score: verdict.score,
          reason: verdict.reasoning,
          duration_ms: Date.now() - start,
        });
      } catch (err) {
        results.push({
          name: judge.name,
          passed: false,
          reason: `Judge failed: ${err instanceof Error ? err.message : String(err)}`,
          duration_ms: Date.now() - start,
        });
      }
    }

    return results;
  }

  private parseJudgeResponse(response: string): JudgeVerdict {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*"score"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: typeof parsed.score === 'number' ? Math.min(1, Math.max(0, parsed.score)) : 0,
          reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
        };
      }
    } catch {
      // Fall through
    }
    return { score: 0, reasoning: `Could not parse judge response: ${response.slice(0, 200)}` };
  }
}
