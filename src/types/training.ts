import type { ImprovementCandidate } from './eval.js';

export interface TrainingPair {
  id: string;
  source_agent: string;
  student_agent: string;
  source_sessions: string[];
  status: string;
  progress: number;
  traces_shared: number;
  improvements: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTrainingPairBody {
  source_agent: string;
  student_agent: string;
  source_sessions?: string[];
}

export interface UpdateTrainingPairBody {
  status?: string;
  progress?: number;
  traces_shared?: number;
  improvements?: number;
  source_sessions?: string[];
}

export interface TraceFlag {
  id: string;
  trace_node_id: string;
  session_id: string;
  agent_id: string;
  flag: 'good' | 'bad' | 'needs_review';
  notes: string | null;
  flagged_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTraceFlagBody {
  trace_node_id: string;
  flag: 'good' | 'bad' | 'needs_review';
  notes?: string;
}

export interface UpdateTraceFlagBody {
  flag?: 'good' | 'bad' | 'needs_review';
  notes?: string | null;
}

export interface TraceFlagStats {
  total: number;
  good: number;
  bad: number;
  needs_review: number;
  by_agent: Record<string, { good: number; bad: number; needs_review: number }>;
}

export interface TraceFlagQuery {
  session_id?: string;
  agent_id?: string;
  flag?: string;
  limit?: number;
  offset?: number;
}

// ── Improvement Candidates ──

export interface CreateCandidatesFromCompareBody {
  suite_id: string;
  run_a: string;
  run_b: string;
  include?: 'regressions' | 'improvements' | 'all';
}

export interface CreateCandidatesResult {
  candidates: ImprovementCandidate[];
  count: number;
}

export interface ImprovementCandidateQuery {
  suite_id?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}
