import type { HttpClient } from '../http.js';
import type { A2AConversation, A2AMessage, A2APeer, A2AConversationListOpts } from '../types/a2a.js';

export class A2AResource {
  constructor(private http: HttpClient) {}

  async conversations(opts?: A2AConversationListOpts): Promise<A2AConversation[]> {
    return this.http.get<A2AConversation[]>('/v1/a2a/conversations', {
      params: opts as Record<string, string | undefined>,
    });
  }

  async conversation(conversationId: string): Promise<A2AConversation> {
    return this.http.get<A2AConversation>(`/v1/a2a/conversations/${conversationId}`);
  }

  async messages(conversationId: string): Promise<A2AMessage[]> {
    return this.http.get<A2AMessage[]>(`/v1/a2a/conversations/${conversationId}/messages`);
  }

  async peers(agentId: string): Promise<A2APeer[]> {
    return this.http.get<A2APeer[]>(`/v1/a2a/agents/${agentId}/peers`);
  }
}
