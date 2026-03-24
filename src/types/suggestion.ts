export interface OptimizationSuggestion {
  id: string;
  agent_id: string;
  suggestion_type: string;
  title: string;
  description: string;
  cluster_id: string | null;
  confidence: number;
  evidence: Record<string, unknown>;
  status: string;
  owner_id: string;
  created_at: string;
}

export interface CreateSuggestionBody {
  agent_id: string;
  suggestion_type: string;
  title: string;
  description: string;
  cluster_id?: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
}

export interface UpdateSuggestionBody {
  status?: string;
  title?: string;
  description?: string;
  confidence?: number;
}

export interface SuggestionListOpts {
  agent_id?: string;
  status?: string;
  suggestion_type?: string;
}
