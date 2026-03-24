import type { HttpClient } from '../http.js';
import type { TrainingPair, CreateTrainingPairBody, UpdateTrainingPairBody } from '../types/training.js';

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
}
