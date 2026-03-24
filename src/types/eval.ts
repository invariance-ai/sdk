export interface EvalSuite {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvalSuiteBody {
  name: string;
  description?: string;
  agent_id?: string;
}

export interface EvalCase {
  id: string;
  suite_id: string;
  name: string;
  type: string;
  assertion_config: Record<string, unknown> | null;
  judge_config: Record<string, unknown> | null;
  weight: number;
  created_at: string;
}

export interface CreateEvalCaseBody {
  name: string;
  type: string;
  assertion_config?: Record<string, unknown>;
  judge_config?: Record<string, unknown>;
  weight?: number;
}

export interface EvalRun {
  id: string;
  suite_id: string;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  version_label: string | null;
  score: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface RunEvalBody {
  agent_id: string;
  version_label?: string;
  session_ids?: string[];
}

export interface EvalCaseResult {
  id: string;
  run_id: string;
  case_id: string;
  case_name: string;
  passed: boolean;
  score: number | null;
  details: Record<string, unknown> | null;
}

export interface EvalCompareResult {
  suite_id: string;
  run_a: EvalRun;
  run_b: EvalRun;
  regressions: EvalCaseResult[];
  improvements: EvalCaseResult[];
  unchanged: EvalCaseResult[];
}

export interface EvalThreshold {
  id: string;
  suite_id: string;
  metric: string;
  operator: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
  value: number;
  created_at: string;
}

export interface CreateEvalThresholdBody {
  suite_id: string;
  metric: string;
  operator: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
  value: number;
}
