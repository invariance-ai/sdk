import type { HttpClient } from '../http.js';

export class DocsResource {
  constructor(private http: HttpClient) {}

  async get(): Promise<unknown> {
    return this.http.get('/v1/docs');
  }
}
