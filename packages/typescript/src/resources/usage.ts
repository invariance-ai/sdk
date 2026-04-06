import type { HttpClient } from '../http.js';
import type { UsageEvent, UsageQuery } from '../types/misc.js';

export class UsageResource {
  constructor(private http: HttpClient) {}

  async query(opts?: UsageQuery): Promise<UsageEvent[]> {
    return this.http.get<UsageEvent[]>('/v1/usage', {
      params: opts as Record<string, string | number | undefined>,
    });
  }
}
