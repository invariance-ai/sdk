import type { HttpClient } from '../http.js';
import type {
  TrainingPair, CreateTrainingPairBody, UpdateTrainingPairBody,
  TraceFlag, CreateTraceFlagBody, UpdateTraceFlagBody, TraceFlagStats, TraceFlagQuery,
  CreateCandidatesFromCompareBody, CreateCandidatesResult, ImprovementCandidateQuery,
} from '../types/training.js';
import type { ImprovementCandidate } from '../types/eval.js';

export class TrainingResource {
  constructor(private http: HttpClient) {}

  async list(opts?: { status?: string }): Promise<TrainingPair[]> {
    return this.http.get<TrainingPair[]>('/v1/training/pairs', {
      params: opts as Record<string, string | undefined>,
    });
  }

  async get(id: string): Promise<TrainingPair> {
    return this.http.get<TrainingPair>(`/v1/training/pairs/${id}`);
  }

  async create(body: CreateTrainingPairBody): Promise<TrainingPair> {
    return this.http.post<TrainingPair>('/v1/training/pairs', body);
  }

  async update(id: string, body: UpdateTrainingPairBody): Promise<TrainingPair> {
    return this.http.patch<TrainingPair>(`/v1/training/pairs/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/training/pairs/${id}`);
  }

  // Trace Flags
  async createFlag(body: CreateTraceFlagBody): Promise<TraceFlag> {
    return this.http.post<TraceFlag>('/v1/training/flags', body);
  }

  async listFlags(opts?: TraceFlagQuery): Promise<TraceFlag[]> {
    return this.http.get<TraceFlag[]>('/v1/training/flags', { params: opts as Record<string, string | number | undefined> });
  }

  async updateFlag(id: string, body: UpdateTraceFlagBody): Promise<TraceFlag> {
    return this.http.patch<TraceFlag>(`/v1/training/flags/${id}`, body);
  }

  async deleteFlag(id: string): Promise<void> {
    await this.http.delete(`/v1/training/flags/${id}`);
  }

  async flagStats(): Promise<TraceFlagStats> {
    return this.http.get<TraceFlagStats>('/v1/training/flags/stats');
  }

  // Improvement Candidates
  async createCandidatesFromEvalCompare(body: CreateCandidatesFromCompareBody): Promise<CreateCandidatesResult> {
    return this.http.post<CreateCandidatesResult>('/v1/training/candidates/from-eval-compare', body);
  }

  async listImprovementCandidates(opts?: ImprovementCandidateQuery): Promise<ImprovementCandidate[]> {
    return this.http.get<ImprovementCandidate[]>('/v1/training/improvement-candidates', {
      params: opts as Record<string, string | number | undefined>,
    });
  }
}
