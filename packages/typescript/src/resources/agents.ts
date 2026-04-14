import type { HttpClient } from '../http.js';
import type { AgentRecord, AgentMetrics, AgentActionTemplate, AgentActionPolicy } from '../types/agent.js';

export class AgentsResource {
  constructor(private http: HttpClient) {}

  async create(opts: {
    name: string;
    public_key?: string;
  }): Promise<AgentRecord> {
    return this.http.post<AgentRecord>('/v1/agents', opts);
  }

  async list(): Promise<AgentRecord[]> {
    return this.http.get<AgentRecord[]>('/v1/agents');
  }

  async get(id: string): Promise<AgentRecord> {
    return this.http.get<AgentRecord>(`/v1/agents/${id}`);
  }

  async metrics(): Promise<{ metrics: AgentMetrics[] }> {
    return this.http.get<{ metrics: AgentMetrics[] }>('/v1/agents/metrics');
  }

  async upsertTemplates(agentId: string, templates: AgentActionTemplate[]): Promise<{ updated: number }> {
    return this.http.put<{ updated: number }>(`/v1/agents/${agentId}/templates`, { templates });
  }

  async getTemplates(agentId: string): Promise<AgentActionTemplate[]> {
    return this.http.get<AgentActionTemplate[]>(`/v1/agents/${agentId}/templates`);
  }

  async upsertPolicies(agentId: string, policies: AgentActionPolicy[]): Promise<{ updated: number }> {
    return this.http.put<{ updated: number }>(`/v1/agents/${agentId}/policies`, { policies });
  }

  async getPolicies(agentId: string): Promise<AgentActionPolicy[]> {
    return this.http.get<AgentActionPolicy[]>(`/v1/agents/${agentId}/policies`);
  }
}
