import type { HttpClient } from '../http.js';
import type {
  NLQueryResult, TraceQueryOpts, StructuredTraceQuery, TraceQueryResult,
  StatsResult, StatsQuery, AgentNote, WriteNoteOpts, ToolSchema, QueryScope,
} from '../types/query.js';

export class QueryResource {
  constructor(private http: HttpClient) {}

  async ask(question: string, scope?: QueryScope): Promise<NLQueryResult> {
    return this.http.post<NLQueryResult>('/v1/query', { question, scope });
  }

  async traces(opts: TraceQueryOpts): Promise<TraceQueryResult> {
    return this.http.post<TraceQueryResult>('/v1/query/traces', opts);
  }

  async tracesStructured(query: StructuredTraceQuery): Promise<TraceQueryResult> {
    return this.http.post<TraceQueryResult>('/v1/query/traces/structured', query);
  }

  async stats(opts?: StatsQuery): Promise<StatsResult> {
    return this.http.get<StatsResult>('/v1/query/stats', {
      params: opts as Record<string, string | undefined>,
    });
  }

  async writeNote(opts: WriteNoteOpts): Promise<AgentNote> {
    return this.http.post<AgentNote>('/v1/query/notes', opts);
  }

  async readNote(key: string): Promise<{ data: AgentNote | null }> {
    return this.http.get<{ data: AgentNote | null }>(`/v1/query/notes/${key}`);
  }

  async tools(): Promise<{ tools: ToolSchema[] }> {
    return this.http.get<{ tools: ToolSchema[] }>('/v1/query/tools');
  }
}
