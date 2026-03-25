import type { HttpClient } from '../http.js';
import type { Scorer, CreateScorerBody, UpdateScorerBody } from '../types/scorer.js';

export class ScorersResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<Scorer[]> {
    return this.http.get<Scorer[]>('/v1/scorers');
  }

  async get(id: string): Promise<Scorer> {
    return this.http.get<Scorer>(`/v1/scorers/${id}`);
  }

  async create(body: CreateScorerBody): Promise<Scorer> {
    return this.http.post<Scorer>('/v1/scorers', body);
  }

  async update(id: string, body: UpdateScorerBody): Promise<Scorer> {
    return this.http.patch<Scorer>(`/v1/scorers/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/scorers/${id}`);
  }
}
