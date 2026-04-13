import type { HttpClient } from '../http.js';
import type { RemoteSession, SessionCreateBody, SessionCreateResult, SessionListOpts } from '../types/session.js';
import type { Signal } from '../types/signal.js';
import type { VerifyResult } from '../types/misc.js';

export class SessionsResource {
  constructor(private http: HttpClient) {}

  async create(opts: SessionCreateBody): Promise<SessionCreateResult> {
    return this.http.post('/v1/sessions', opts);
  }

  async list(opts?: SessionListOpts): Promise<RemoteSession[]> {
    return this.http.get<RemoteSession[]>('/v1/sessions', { params: opts as Record<string, string | number | undefined> });
  }

  async get(id: string): Promise<RemoteSession & { receipt_count: number }> {
    return this.http.get(`/v1/sessions/${id}`);
  }

  async close(id: string, status: string, closeHash: string): Promise<{ id: string; status: string; close_hash: string }> {
    return this.http.patch(`/v1/sessions/${id}`, { status, close_hash: closeHash });
  }

  async verify(id: string): Promise<VerifyResult> {
    return this.http.get<VerifyResult>(`/v1/sessions/${id}/verify`);
  }

  async proofSummary(id: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/sessions/${id}/proof-summary`);
  }

  async summary(id: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${id}/summary`);
  }

  async proof(id: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${id}/proof`);
  }

  async replay(id: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/v1/trace/sessions/${id}/replay`);
  }

  async signals(id: string, opts?: { limit?: number }): Promise<{ session_id: string; signals: Signal[] }> {
    return this.http.get<{ session_id: string; signals: Signal[] }>(`/v1/query/session/${id}/signals`, {
      params: opts as Record<string, string | number | undefined>,
    });
  }
}
