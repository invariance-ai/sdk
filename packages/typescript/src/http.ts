import { InvarianceError } from './errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  maxRetries?: number;
  onError?: (error: InvarianceError) => void;
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private maxRetries: number;
  private onError?: (error: InvarianceError) => void;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.maxRetries = config.maxRetries ?? 3;
    this.onError = config.onError;
  }

  async get<T>(path: string, opts?: { params?: Record<string, string | number | boolean | undefined> }): Promise<T> {
    const url = this.buildUrl(path, opts?.params);
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(this.buildUrl(path), { method: 'DELETE' });
  }

  async raw(path: string, init?: RequestInit): Promise<Response> {
    const url = this.buildUrl(path);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    return fetch(url, { ...init, headers });
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
    const fullPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(fullPath, base);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);

    let lastError: InvarianceError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
      }

      let response: Response;
      try {
        response = await fetch(url, { ...init, headers });
      } catch (err) {
        lastError = new InvarianceError(
          'API_ERROR',
          `Network error: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      if (response.ok) {
        const payload = await this.readResponseBody(response);
        return payload as T;
      }

      const errorPayload = await this.readResponseBody(response);
      const errorBody = typeof errorPayload === 'string' ? errorPayload : JSON.stringify(errorPayload);
      let details: unknown;
      details = errorPayload;

      const error = new InvarianceError(
        'API_ERROR',
        `${init.method ?? 'GET'} ${url} returned ${response.status}: ${errorBody}`,
        response.status,
        details,
      );

      if (response.status >= 500) {
        lastError = error;
        continue;
      }

      this.onError?.(error);
      throw error;
    }

    if (lastError) {
      this.onError?.(lastError);
      throw lastError;
    }

    throw new InvarianceError('API_ERROR', 'Request failed after all retries');
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const textFn = response.text;
    if (typeof textFn === 'function') {
      const text = await textFn.call(response);
      if (!text) return undefined;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }

    const jsonFn = (response as Response & { json?: () => Promise<unknown> }).json;
    if (typeof jsonFn === 'function') {
      return jsonFn.call(response);
    }

    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
