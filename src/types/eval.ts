export interface EvalSuite {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  owner_id?: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  case_count?: number;
  latest_pass_rate?: number | null;
  latest_version_label?: string | null;
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
  type: 'assertion' | 'judge';
  assertion_config: Record<string, unknown> | null;
  judge_config: Record<string, unknown> | null;
  weight: number;
  scorer_id?: string | null;
  created_at: string;
}

export interface CreateEvalCaseBody {
  name: string;
  type: 'assertion' | 'judge';
  assertion_config?: Record<string, unknown>;
  judge_config?: Record<string, unknown>;
  weight?: number;
  scorer_id?: string;
}

export interface EvalRun {
  id: string;
  suite_id: string;
  agent_id: string;
  version_label: string | null;
  status: 'running' | 'completed' | 'failed';
  total_cases?: number;
  passed_cases?: number;
  failed_cases?: number;
  pass_rate?: number | null;
  avg_score?: number | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
  owner_id?: string;
  started_at: string;
  completed_at: string | null;
  created_at?: string;
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
  passed: boolean;
  result_status?: 'completed' | 'pending_human' | 'error';
  score: number | null;
  reason?: string | null;
  actual_output?: unknown;
  trace_node_id?: string | null;
  session_id?: string | null;
  dataset_row_id?: string | null;
  dataset_version?: number | null;
  dataset_row_index?: number | null;
  duration_ms?: number | null;
  judge_reasoning?: string | null;
  created_at?: string;
  case_name?: string;
  case_type?: string;
}

export interface EvalCompareResult {
  run_a: EvalRun;
  run_b: EvalRun;
  overall_delta: { pass_rate: number; avg_score: number };
  per_case: Array<{
    case_id: string;
    case_name: string;
    a_passed: boolean;
    b_passed: boolean;
    a_score: number | null;
    b_score: number | null;
    delta: number | null;
  }>;
  regressions: number;
  improvements: number;
}

export interface EvalThreshold {
  id: string;
  suite_id: string;
  metric: 'pass_rate' | 'avg_score';
  min_value: number;
  webhook_url: string | null;
  status: 'active' | 'paused';
  owner_id: string;
  last_triggered: string | null;
  created_at: string;
}

export interface CreateEvalThresholdBody {
  suite_id: string;
  metric: 'pass_rate' | 'avg_score';
  min_value: number;
  webhook_url?: string;
}
