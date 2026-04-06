import type { HttpClient } from '../http.js';
import type { TemplatePack, TemplateApplyResult } from '../types/misc.js';

export class TemplatesResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<TemplatePack[]> {
    return this.http.get<TemplatePack[]>('/v1/templates');
  }

  async apply(id: string, opts?: { agent_id?: string }): Promise<TemplateApplyResult> {
    return this.http.post<TemplateApplyResult>(`/v1/templates/${id}/apply`, opts ?? {});
  }
}
