import type { HttpClient } from '../http.js';
import type { ApiKeyRecord, CreateApiKeyBody } from '../types/misc.js';

export class ApiKeysResource {
  constructor(private http: HttpClient) {}

  async create(body?: CreateApiKeyBody): Promise<ApiKeyRecord> {
    return this.http.post<ApiKeyRecord>('/v1/api-keys', body ?? {});
  }

  async list(): Promise<ApiKeyRecord[]> {
    return this.http.get<ApiKeyRecord[]>('/v1/api-keys');
  }

  async revoke(id: string): Promise<{ revoked: boolean }> {
    return this.http.delete<{ revoked: boolean }>(`/v1/api-keys/${id}`);
  }
}
