import type { HttpClient } from '../http.js';
import type { Experiment, CreateExperimentBody, ExperimentCompareResult } from '../types/experiment.js';

export class ExperimentsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: { suite_id?: string; dataset_id?: string; status?: string; limit?: number; offset?: number }): Promise<Experiment[]> {
    return this.http.get<Experiment[]>('/v1/experiments', { params: opts as Record<string, string | number | undefined> });
  }

  async get(id: string): Promise<Experiment & { run?: Record<string, unknown> }> {
    return this.http.get<Experiment & { run?: Record<string, unknown> }>(`/v1/experiments/${id}`);
  }

  async create(body: CreateExperimentBody): Promise<Experiment> {
    return this.http.post<Experiment>('/v1/experiments', body);
  }

  async run(id: string): Promise<Experiment> {
    return this.http.post<Experiment>(`/v1/experiments/${id}/run`, {});
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/experiments/${id}`);
  }

  async compare(expA: string, expB: string): Promise<ExperimentCompareResult> {
    return this.http.get<ExperimentCompareResult>('/v1/experiments/compare', {
      params: { exp_a: expA, exp_b: expB },
    });
  }
}
