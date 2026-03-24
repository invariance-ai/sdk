import type { HttpClient } from '../http.js';
import type { SearchResult } from '../types/misc.js';

export class SearchResource {
  constructor(private http: HttpClient) {}

  async query(q: string): Promise<SearchResult[]> {
    return this.http.get<SearchResult[]>('/v1/search', { params: { q } });
  }
}
