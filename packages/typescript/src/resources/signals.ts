import type { HttpClient } from '../http.js';
import type { Signal, SignalQuery, CreateSignalBody, BulkAcknowledgeSignalsBody, SignalStats } from '../types/signal.js';

export class SignalsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: SignalQuery): Promise<{ signals: Signal[]; next_cursor: string | null }> {
    return this.http.get<{ signals: Signal[]; next_cursor: string | null }>('/v1/signals', {
      params: opts as Record<string, string | number | boolean | undefined>,
    });
  }

  async get(id: string): Promise<Signal> {
    return this.http.get<Signal>(`/v1/signals/${id}`);
  }

  async create(body: CreateSignalBody): Promise<Signal> {
    return this.http.post<Signal>('/v1/signals', body);
  }

  async acknowledge(id: string): Promise<Signal> {
    return this.http.patch<Signal>(`/v1/signals/${id}/acknowledge`, {});
  }

  async acknowledgeBulk(body: BulkAcknowledgeSignalsBody): Promise<{ acknowledged: number }> {
    return this.http.post<{ acknowledged: number }>('/v1/signals/acknowledge-bulk', body);
  }

  async stats(): Promise<SignalStats> {
    return this.http.get<SignalStats>('/v1/signals/stats');
  }
}
