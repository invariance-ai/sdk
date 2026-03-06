export class ApiClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request<T = any>(path: string): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async listSessions(status?: string) {
    const qs = status ? `?status=${status}` : '';
    return this.request(`/v1/sessions${qs}`);
  }

  async getSession(id: string) {
    return this.request(`/v1/sessions/${id}`);
  }

  async getReceipts(sessionId: string) {
    return this.request(`/v1/receipts?sessionId=${sessionId}`);
  }

  async verifySession(sessionId: string) {
    return this.request(`/v1/sessions/${sessionId}/verify`);
  }

  async getAgentTemplates(agentId: string) {
    return this.request(`/v1/agents/${agentId}/templates`);
  }

  async listAgents() {
    return this.request(`/v1/agents`);
  }
}
