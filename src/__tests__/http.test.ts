import { describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '../http.js';

describe('fetchWithAuth', () => {
  it('normalizes the URL and injects the Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithAuth('https://api.invariance.dev///', 'inv_test', 'v1/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.invariance.dev/v1/health',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer inv_test');
  });

  it('preserves existing headers while overriding Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithAuth('https://api.invariance.dev', 'inv_test', '/v1/trace/events', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer stale',
        'X-Test': '1',
      },
    });

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer inv_test');
    expect(headers.get('X-Test')).toBe('1');
  });
});
