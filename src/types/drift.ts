export interface DriftCatch {
  id: string;
  session_a: string;
  session_b: string;
  agent: string;
  task: string;
  similarity_score: number;
  divergence_reason: string;
  caught_at: string;
  severity: string;
}

export interface DriftComparison {
  run_a: unknown;
  run_b: unknown;
  divergence_point: unknown;
  divergence_reason: string;
  similarity_score: number;
  aligned_steps: unknown[];
}

export interface DriftComparisonQuery {
  session_a?: string;
  session_b?: string;
}
