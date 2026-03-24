import { fetchWithAuth } from '../http.js';

export class ApiClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request<T = any>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body.trim();
      if (detail) {
        try {
          const parsed = JSON.parse(detail) as { error?: string; message?: string };
          detail = parsed.error ?? parsed.message ?? detail;
        } catch {
          // Keep original response text as detail when it's not JSON.
        }
      }
      throw new Error(detail ? `API error ${res.status}: ${detail}` : `API error ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async post<T = any>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async del<T = any>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async patch<T = any>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ── Sessions ──

  async listSessions(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/v1/sessions${qs}`);
  }

  async getSession(id: string) {
    return this.request(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  async getReceipts(sessionId: string) {
    return this.request(`/v1/receipts?sessionId=${encodeURIComponent(sessionId)}`);
  }

  async verifySession(sessionId: string) {
    return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/verify`);
  }

  async getAgentTemplates(agentId: string) {
    return this.request(`/v1/agents/${encodeURIComponent(agentId)}/templates`);
  }

  async listAgents() {
    return this.request(`/v1/agents`);
  }

  // ── Monitors ──

  async listMonitors(opts?: { status?: string; agentId?: string }) {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.agentId) params.set('agent_id', opts.agentId);
    const qs = params.toString();
    return this.request(`/v1/monitors${qs ? `?${qs}` : ''}`);
  }

  async createMonitor(body: { name: string; natural_language: string; agent_id?: string; severity?: string }) {
    return this.post('/v1/monitors', body);
  }

  async deleteMonitor(id: string) {
    return this.del(`/v1/monitors/${encodeURIComponent(id)}`);
  }

  async evaluateMonitor(id: string) {
    return this.post(`/v1/monitors/${encodeURIComponent(id)}/evaluate`, {});
  }

  // ── Evals ──

  async listEvalSuites(opts?: { agentId?: string }) {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set('agent_id', opts.agentId);
    const qs = params.toString();
    return this.request(`/v1/evals/suites${qs ? `?${qs}` : ''}`);
  }

  async runEval(suiteId: string, body: { agent_id: string; version_label?: string }) {
    return this.post(`/v1/evals/suites/${encodeURIComponent(suiteId)}/run`, body);
  }

  async compareEvalRuns(suiteId: string, runA: string, runB: string) {
    const params = new URLSearchParams({ suite_id: suiteId, run_a: runA, run_b: runB });
    return this.request(`/v1/evals/compare?${params.toString()}`);
  }

  async listEvalThresholds(opts?: { suiteId?: string; metric?: string }) {
    const params = new URLSearchParams();
    if (opts?.suiteId) params.set('suite_id', opts.suiteId);
    if (opts?.metric) params.set('metric', opts.metric);
    const qs = params.toString();
    return this.request(`/v1/evals/thresholds${qs ? `?${qs}` : ''}`);
  }

  async createEvalThreshold(body: { suite_id: string; min_value: number; metric?: string; webhook_url?: string }) {
    return this.post('/v1/evals/thresholds', body);
  }

  async updateEvalThreshold(id: string, body: { min_value?: number; metric?: string; webhook_url?: string; status?: string }) {
    return this.patch(`/v1/evals/thresholds/${encodeURIComponent(id)}`, body);
  }

  async deleteEvalThreshold(id: string) {
    return this.del(`/v1/evals/thresholds/${encodeURIComponent(id)}`);
  }

  async listFailureClusters(opts?: { agentId?: string; status?: string; clusterType?: string }) {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set('agent_id', opts.agentId);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.clusterType) params.set('cluster_type', opts.clusterType);
    const qs = params.toString();
    return this.request(`/v1/evals/clusters${qs ? `?${qs}` : ''}`);
  }

  async createFailureCluster(body: { agent_id: string; cluster_type: string; label: string; description?: string; severity?: string }) {
    return this.post('/v1/evals/clusters', body);
  }

  async updateFailureCluster(id: string, body: { status?: string; resolution_notes?: string; label?: string; description?: string; severity?: string }) {
    return this.patch(`/v1/evals/clusters/${encodeURIComponent(id)}`, body);
  }

  async addFailureClusterMember(id: string, body: { trace_node_id: string; session_id: string }) {
    return this.post(`/v1/evals/clusters/${encodeURIComponent(id)}/members`, body);
  }

  async deleteFailureCluster(id: string) {
    return this.del(`/v1/evals/clusters/${encodeURIComponent(id)}`);
  }

  async listOptimizationSuggestions(opts?: { agentId?: string; status?: string; suggestionType?: string }) {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set('agent_id', opts.agentId);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.suggestionType) params.set('suggestion_type', opts.suggestionType);
    const qs = params.toString();
    return this.request(`/v1/evals/suggestions${qs ? `?${qs}` : ''}`);
  }

  async createOptimizationSuggestion(body: {
    agent_id: string;
    suggestion_type: string;
    title: string;
    description: string;
    cluster_id?: string;
    confidence?: number;
  }) {
    return this.post('/v1/evals/suggestions', body);
  }

  async updateOptimizationSuggestion(id: string, body: { status?: string; title?: string; description?: string; confidence?: number }) {
    return this.patch(`/v1/evals/suggestions/${encodeURIComponent(id)}`, body);
  }

  async deleteOptimizationSuggestion(id: string) {
    return this.del(`/v1/evals/suggestions/${encodeURIComponent(id)}`);
  }

  // ── Drift ──

  async getDriftCatches() {
    return this.request('/v1/drift/catches');
  }

  async getDriftComparison(sessionA: string, sessionB: string) {
    const params = new URLSearchParams({ session_a: sessionA, session_b: sessionB });
    return this.request(`/v1/drift/comparison?${params.toString()}`);
  }

  // ── Training ──

  async listTraceFlags(opts?: { flag?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (opts?.flag) params.set('flag', opts.flag);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.request(`/v1/training/flags${qs ? `?${qs}` : ''}`);
  }

  async getTraceFlagStats() {
    return this.request('/v1/training/flags/stats');
  }

  // ── Identities ──

  async listIdentities() {
    return this.request('/v1/identities');
  }

  // ── Search ──

  async search(query: string) {
    const params = new URLSearchParams({ q: query });
    return this.request(`/v1/search?${params.toString()}`);
  }
}
