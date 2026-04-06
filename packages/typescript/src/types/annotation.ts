export interface AnnotationQueueItem {
  id: string;
  target_type: 'trace_node' | 'dataset_row' | 'eval_result';
  target_id: string;
  session_id: string | null;
  agent_id: string | null;
  scorer_id: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assigned_to: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnotationBody {
  target_type: 'trace_node' | 'dataset_row' | 'eval_result';
  target_id: string;
  session_id?: string;
  agent_id?: string;
  scorer_id?: string;
  priority?: number;
}

export interface UpdateAnnotationBody {
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assigned_to?: string | null;
  priority?: number;
}

export interface HumanScore {
  id: string;
  target_type: 'trace_node' | 'dataset_row' | 'eval_result';
  target_id: string;
  session_id: string | null;
  agent_id: string | null;
  scorer_id: string | null;
  score: number;
  criteria_scores: Record<string, number>;
  notes: string | null;
  scored_by: string;
  created_at: string;
}

export interface SubmitAnnotationScoreBody {
  score: number;
  criteria_scores?: Record<string, number>;
  notes?: string;
}

export interface HumanScoreStats {
  total: number;
  avg_score: number;
  by_target_type: Record<string, number>;
  by_scorer: Record<string, number>;
}
