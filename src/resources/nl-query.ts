import type { HttpClient } from '../http.js';
import type { NLQueryResult } from '../types/query.js';

export class NLQueryResource {
  constructor(private http: HttpClient) {}

  async ask(question: string, opts?: { conversationId?: string; context?: { agent_id?: string; session_id?: string } }): Promise<NLQueryResult> {
    return this.http.post<NLQueryResult>('/v1/nl-query', {
      question,
      conversation_id: opts?.conversationId,
      context: opts?.context,
    });
  }
}
