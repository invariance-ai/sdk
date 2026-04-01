import type { HttpClient } from '../http.js';
import type {
  Monitor, CreateMonitorBody, UpdateMonitorBody, MonitorValidateResult,
  MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview,
  MonitorDefinition,
} from '../types/monitor.js';

export class MonitorsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: { status?: string; agent_id?: string }): Promise<Monitor[]> {
    return this.http.get<Monitor[]>('/v1/monitors', { params: opts as Record<string, string | undefined> });
  }

  async get(id: string): Promise<Monitor> {
    return this.http.get<Monitor>(`/v1/monitors/${id}`);
  }

  async create(body: CreateMonitorBody): Promise<Monitor> {
    return this.http.post<Monitor>('/v1/monitors', body);
  }

  async update(id: string, body: UpdateMonitorBody): Promise<Monitor> {
    return this.http.patch<Monitor>(`/v1/monitors/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/monitors/${id}`);
  }

  async evaluate(id: string): Promise<MonitorEvaluateResult> {
    return this.http.post<MonitorEvaluateResult>(`/v1/monitors/${id}/evaluate`);
  }

  async evaluateAll(): Promise<unknown> {
    return this.http.post('/v1/monitors/evaluate-all');
  }

  async validate(definition: MonitorDefinition): Promise<MonitorValidateResult> {
    return this.http.post<MonitorValidateResult>('/v1/monitors/validate', { definition });
  }

  async compilePreview(rule: string): Promise<MonitorCompilePreview> {
    return this.http.post<MonitorCompilePreview>('/v1/monitors/compile-preview', { rule });
  }

  async listEvents(opts?: MonitorEventsQuery): Promise<{ events: MonitorSignal[]; next_cursor?: string }> {
    return this.http.get<{ events: MonitorSignal[]; next_cursor?: string }>('/v1/monitors/events', {
      params: opts as Record<string, string | number | boolean | undefined>,
    });
  }

  async acknowledgeEvent(eventId: string): Promise<Record<string, unknown>> {
    return this.http.patch<Record<string, unknown>>(`/v1/monitors/events/${eventId}/acknowledge`, {});
  }
}
