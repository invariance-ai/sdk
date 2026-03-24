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
