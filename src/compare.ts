import { fetchWithAuth } from './http.js';
import { InvarianceError } from './errors.js';

interface DriftComparison {
  run_a: Record<string, unknown>;
  run_b: Record<string, unknown>;
  divergence_point: number | null;
  divergence_reason: string;
  similarity_score: number;
  aligned_steps: Array<Record<string, unknown>>;
}

/**
 * Compare two sessions using the drift comparison API.
 * Phase 1: thin wrapper over GET /v1/drift/comparison.
 */
export async function compareSessions(
  config: { apiUrl: string; apiKey: string },
  sessionA: string,
  sessionB: string,
): Promise<DriftComparison> {
  const params = new URLSearchParams({
    session_a: sessionA,
    session_b: sessionB,
  });
  const res = await fetchWithAuth(
    config.apiUrl,
    config.apiKey,
    `/v1/drift/comparison?${params.toString()}`,
  );
  if (!res.ok) {
    throw new InvarianceError('API_ERROR', `GET /v1/drift/comparison returned ${res.status}`);
  }
  return await res.json() as DriftComparison;
}
