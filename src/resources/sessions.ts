import type { HttpClient } from '../http.js';
import type { RemoteSession, SessionListOpts } from '../types/session.js';
import type { VerifyResult } from '../types/misc.js';

export class SessionsResource {
  constructor(private http: HttpClient) {}

  async create(opts: { id: string; name: string; agent_id?: string }): Promise<{ id: string; name: string; created_by: string; status: string }> {
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
}
