/**
 * Shared HTTP helper for authenticated API requests.
 */
export function fetchWithAuth(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return fetch(`${normalizedBase}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      'Authorization': `Bearer ${apiKey}`,
    },
  });
}
