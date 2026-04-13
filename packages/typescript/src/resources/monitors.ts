import type { HttpClient } from '../http.js';
import type {
  Monitor, CreateMonitorBody, UpdateMonitorBody, MonitorValidateResult,
  MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview,
  MonitorDefinition, MonitorListOpts,
  MonitorExecutionListResponse,
  MonitorFindingListResponse,
  MonitorHistoryListParams,
  MonitorReview, MonitorReviewCreateBody, MonitorReviewUpdateBody,
  MonitorReviewListResponse, MonitorReviewListParams,
  SimpleMonitorBody,
} from '../types/monitor.js';

export class MonitorsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: MonitorListOpts): Promise<Monitor[]> {
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

  // ── Simple Monitor ──

  async createSimple(body: SimpleMonitorBody): Promise<Monitor> {
    return this.http.post<Monitor>('/v1/monitors/simple', body);
  }

  // ── Executions ──

  async listExecutions(monitorId: string, params?: MonitorHistoryListParams): Promise<MonitorExecutionListResponse> {
    return this.http.get<MonitorExecutionListResponse>(`/v1/monitors/${monitorId}/executions`, {
      params: params as Record<string, string | number | undefined>,
    });
  }

  // ── Findings ──

  async listFindings(monitorId: string, params?: MonitorHistoryListParams): Promise<MonitorFindingListResponse> {
    return this.http.get<MonitorFindingListResponse>(`/v1/monitors/${monitorId}/findings`, {
      params: params as Record<string, string | number | undefined>,
    });
  }

  // ── Reviews ──

  async listReviews(params?: MonitorReviewListParams): Promise<MonitorReviewListResponse> {
    return this.http.get<MonitorReviewListResponse>('/v1/monitors/reviews', {
      params: params as Record<string, string | number | undefined>,
    });
  }

  async getReview(id: string): Promise<MonitorReview> {
    return this.http.get<MonitorReview>(`/v1/monitors/reviews/${id}`);
  }

  async createReview(body: MonitorReviewCreateBody): Promise<MonitorReview> {
    return this.http.post<MonitorReview>('/v1/monitors/reviews', body);
  }

  async updateReview(id: string, body: MonitorReviewUpdateBody): Promise<MonitorReview> {
    return this.http.patch<MonitorReview>(`/v1/monitors/reviews/${id}`, body);
  }

  async claimReview(id: string): Promise<MonitorReview> {
    return this.http.patch<MonitorReview>(`/v1/monitors/reviews/${id}`, { status: 'claimed' });
  }

  async resolveReview(id: string, decision: 'pass' | 'fail' | 'needs_fix', notes?: string): Promise<MonitorReview> {
    return this.http.patch<MonitorReview>(`/v1/monitors/reviews/${id}`, { decision, ...(notes ? { notes } : {}) });
  }
}
