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
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);

  return fetch(`${normalizedBase}${normalizedPath}`, {
    ...init,
    headers,
  });
}
