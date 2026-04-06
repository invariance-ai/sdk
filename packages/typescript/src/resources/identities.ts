import type { HttpClient } from '../http.js';
import type { IdentityRecord } from '../types/identity.js';

export class IdentitiesResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<IdentityRecord[]> {
    return this.http.get<IdentityRecord[]>('/v1/identities');
  }

  async get(id: string): Promise<IdentityRecord> {
    return this.http.get<IdentityRecord>(`/v1/identities/${id}`);
  }
}
