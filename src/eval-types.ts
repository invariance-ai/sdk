/** Result of a single eval assertion or judge evaluation */
export interface EvalResult {
  /** Name of the eval check */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Numeric score (0-1) for scored evaluations */
  score?: number;
  /** Human-readable reason for the result */
  reason?: string;
  /** How long the eval took to run in ms */
  duration_ms: number;
}

/** Configuration for an LLM-based judge evaluation */
export interface JudgeConfig {
  /** The prompt to send to the LLM judge */
  prompt: string;
  /** Provider-agnostic LLM call function */
  provider: (prompt: string) => Promise<string>;
}

/** Verdict returned by an LLM judge */
export interface JudgeVerdict {
  /** Numeric score (0-1) */
  score: number;
  /** Judge's reasoning */
  reasoning: string;
}
