export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  dataset_id: string;
  dataset_version: number;
  suite_id: string;
  prompt_version_id: string | null;
  config: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_id: string | null;
  owner_id: string;
  created_at: string;
  completed_at: string | null;
}

export interface CreateExperimentBody {
  name: string;
  description?: string;
  dataset_id: string;
  dataset_version: number;
  suite_id: string;
  prompt_version_id?: string;
  config?: Record<string, unknown>;
}

export interface ExperimentCompareResult {
  experiment_a: Experiment;
  experiment_b: Experiment;
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
  dataset_version_a: number;
  dataset_version_b: number;
}
