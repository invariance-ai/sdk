import type { HttpClient } from '../http.js';
import type {
  Prompt,
  PromptVersion,
  CreatePromptBody,
  UpdatePromptBody,
  CreatePromptVersionBody,
  PromptDiffResult,
} from '../types/prompt.js';

export class PromptsResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<Prompt[]> {
    return this.http.get<Prompt[]>('/v1/prompts');
  }

  async get(id: string): Promise<Prompt & { latest?: PromptVersion }> {
    return this.http.get<Prompt & { latest?: PromptVersion }>(`/v1/prompts/${id}`);
  }

  async create(body: CreatePromptBody): Promise<Prompt> {
    return this.http.post<Prompt>('/v1/prompts', body);
  }

  async update(id: string, body: UpdatePromptBody): Promise<Prompt> {
    return this.http.patch<Prompt>(`/v1/prompts/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/prompts/${id}`);
  }

  async listVersions(id: string): Promise<PromptVersion[]> {
    return this.http.get<PromptVersion[]>(`/v1/prompts/${id}/versions`);
  }

  async createVersion(id: string, body: CreatePromptVersionBody): Promise<PromptVersion> {
    return this.http.post<PromptVersion>(`/v1/prompts/${id}/versions`, body);
  }

  async getVersion(id: string, version: number): Promise<PromptVersion> {
    return this.http.get<PromptVersion>(`/v1/prompts/${id}/versions/${version}`);
  }

  async diff(fromId: string, toId: string): Promise<PromptDiffResult> {
    return this.http.get<PromptDiffResult>('/v1/prompts/diff', {
      params: { from: fromId, to: toId },
    });
  }
}
