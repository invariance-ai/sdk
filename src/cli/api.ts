import { fetchWithAuth } from '../http.js';

export class ApiClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request<T = any>(path: string): Promise<T> {
    const res = await fetchWithAuth(this.apiUrl, this.apiKey, path);
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
}
