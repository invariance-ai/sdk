export interface Scorer {
  id: string;
  name: string;
  type: 'llm' | 'human';
  config: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateScorerBody {
  name: string;
  type: 'llm' | 'human';
  config: Record<string, unknown>;
}

export interface UpdateScorerBody {
  name?: string;
  config?: Record<string, unknown>;
}
