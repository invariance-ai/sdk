import type { HttpClient } from '../http.js';
import type { DriftCatch, DriftComparison, DriftComparisonQuery } from '../types/drift.js';

export class DriftResource {
  constructor(private http: HttpClient) {}

  async catches(): Promise<DriftCatch[]> {
    return this.http.get<DriftCatch[]>('/v1/drift/catches');
  }

  async comparison(opts?: DriftComparisonQuery): Promise<DriftComparison> {
    return this.http.get<DriftComparison>('/v1/drift/comparison', {
      params: opts as Record<string, string | undefined>,
    });
  }
}
