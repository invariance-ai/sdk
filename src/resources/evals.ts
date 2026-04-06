import type { HttpClient } from '../http.js';
import type {
  EvalSuite, CreateEvalSuiteBody, EvalCase, CreateEvalCaseBody,
  EvalRun, RunEvalBody, EvalCaseResult, EvalCompareResult,
  EvalThreshold, CreateEvalThresholdBody,
  EvalLaunchBody, EvalLaunchResult, ReplayLaunchBody, ImprovementCandidate,
  EvalRegressionEntry, EvalLineageEntry,
} from '../types/eval.js';

export class EvalsResource {
  constructor(private http: HttpClient) {}

  // Suites
  async listSuites(opts?: { agent_id?: string }): Promise<EvalSuite[]> {
    return this.http.get<EvalSuite[]>('/v1/evals/suites', { params: opts as Record<string, string | undefined> });
  }

  async getSuite(id: string): Promise<EvalSuite> {
    return this.http.get<EvalSuite>(`/v1/evals/suites/${id}`);
  }

  async createSuite(body: CreateEvalSuiteBody): Promise<EvalSuite> {
    return this.http.post<EvalSuite>('/v1/evals/suites', body);
  }

  async updateSuite(id: string, body: Partial<CreateEvalSuiteBody>): Promise<EvalSuite> {
    return this.http.patch<EvalSuite>(`/v1/evals/suites/${id}`, body);
  }

  async deleteSuite(id: string): Promise<void> {
    await this.http.delete(`/v1/evals/suites/${id}`);
  }

  // Cases
  async listCases(suiteId: string): Promise<EvalCase[]> {
    return this.http.get<EvalCase[]>(`/v1/evals/suites/${suiteId}/cases`);
  }

  async createCase(suiteId: string, body: CreateEvalCaseBody): Promise<EvalCase> {
    return this.http.post<EvalCase>(`/v1/evals/suites/${suiteId}/cases`, body);
  }

  async updateCase(id: string, body: Partial<CreateEvalCaseBody>): Promise<EvalCase> {
    return this.http.patch<EvalCase>(`/v1/evals/cases/${id}`, body);
  }

  async deleteCase(id: string): Promise<void> {
    await this.http.delete(`/v1/evals/cases/${id}`);
  }

  // Runs
  async listRuns(opts?: { suite_id?: string; agent_id?: string; status?: string }): Promise<EvalRun[]> {
    return this.http.get<EvalRun[]>('/v1/evals/runs', { params: opts as Record<string, string | undefined> });
  }

  async getRun(id: string): Promise<EvalRun & { results: EvalCaseResult[] }> {
    return this.http.get<EvalRun & { results: EvalCaseResult[] }>(`/v1/evals/runs/${id}`);
  }

  async rerun(id: string): Promise<EvalRun> {
    return this.http.post<EvalRun>(`/v1/evals/runs/${id}/rerun`, {});
  }

  async triggerRun(suiteId: string, body: RunEvalBody): Promise<EvalRun> {
    return this.http.post<EvalRun>(`/v1/evals/suites/${suiteId}/run`, body);
  }

  // Compare
  async compare(suiteId: string, runA: string, runB: string): Promise<EvalCompareResult> {
    return this.http.get<EvalCompareResult>('/v1/evals/compare', {
      params: { suite_id: suiteId, run_a: runA, run_b: runB },
    });
  }

  // Thresholds
  async listThresholds(opts?: { suite_id?: string; metric?: string }): Promise<EvalThreshold[]> {
    return this.http.get<EvalThreshold[]>('/v1/evals/thresholds', { params: opts as Record<string, string | undefined> });
  }

  async createThreshold(body: CreateEvalThresholdBody): Promise<EvalThreshold> {
    return this.http.post<EvalThreshold>('/v1/evals/thresholds', body);
  }

  async updateThreshold(id: string, body: Partial<CreateEvalThresholdBody>): Promise<EvalThreshold> {
    return this.http.patch<EvalThreshold>(`/v1/evals/thresholds/${id}`, body);
  }

  async deleteThreshold(id: string): Promise<void> {
    await this.http.delete(`/v1/evals/thresholds/${id}`);
  }

  // Orchestration
  async launch(body: EvalLaunchBody): Promise<EvalLaunchResult> {
    return this.http.post<EvalLaunchResult>('/v1/evals/launch', body);
  }

  async launchReplay(body: ReplayLaunchBody): Promise<EvalLaunchResult> {
    return this.http.post<EvalLaunchResult>('/v1/evals/launch', {
      mode: 'replay' as const,
      ...body,
    });
  }

  async listRegressions(opts: { suite_id?: string; agent_id?: string; run_a?: string; run_b?: string }): Promise<EvalRegressionEntry[]> {
    return this.http.get<EvalRegressionEntry[]>('/v1/evals/regressions', { params: opts as Record<string, string | undefined> });
  }

  async getLineage(opts: { agent_id?: string; suite_id?: string; dataset_id?: string; limit?: number }): Promise<EvalLineageEntry[]> {
    return this.http.get<EvalLineageEntry[]>('/v1/evals/lineage', { params: opts as Record<string, string | number | undefined> });
  }

  async listImprovementCandidates(opts?: { suite_id?: string; status?: string; type?: string; limit?: number; offset?: number }): Promise<ImprovementCandidate[]> {
    return this.http.get<ImprovementCandidate[]>('/v1/evals/improvement-candidates', { params: opts as Record<string, string | number | undefined> });
  }

  async updateImprovementCandidate(id: string, body: { status: string }): Promise<ImprovementCandidate> {
    return this.http.patch<ImprovementCandidate>(`/v1/evals/improvement-candidates/${id}`, body);
  }
}
