import type { HttpClient } from '../http.js';
import type {
  OptimizationSuggestion, CreateSuggestionBody, UpdateSuggestionBody,
  SuggestionListOpts,
} from '../types/suggestion.js';

export class SuggestionsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: SuggestionListOpts): Promise<OptimizationSuggestion[]> {
    return this.http.get<OptimizationSuggestion[]>('/v1/evals/suggestions', {
      params: opts as Record<string, string | number | undefined>,
    });
  }

  async create(body: CreateSuggestionBody): Promise<OptimizationSuggestion> {
    return this.http.post<OptimizationSuggestion>('/v1/evals/suggestions', body);
  }

  async update(id: string, body: UpdateSuggestionBody): Promise<OptimizationSuggestion> {
    return this.http.patch<OptimizationSuggestion>(`/v1/evals/suggestions/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/evals/suggestions/${id}`);
  }
}
