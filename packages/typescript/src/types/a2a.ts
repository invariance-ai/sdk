export interface A2AConversation {
  id: string;
  agent_a_id: string;
  agent_a: string;
  agent_b_id: string;
  agent_b: string;
  participants: Array<{ id: string; name: string }>;
  session_ids: string[];
  message_count: number;
  started_at: number;
  last_message_at: number;
  status: 'active' | 'completed';
  all_countersigned: boolean;
  pending_count: number;
  verified_count: number;
  topic: string;
  protocol: string;
  root_trace_node_id: string | null;
  parent_trace_node_id: string | null;
  latest_message_preview: string;
}

export interface A2AMessage {
  id: string;
  conversation_id: string;
  message_id: string;
  parent_message_id: string | null;
  trace_node_id: string | null;
  parent_trace_node_id: string | null;
  session_ids: string[];
  from_agent_id: string;
  to_agent_id: string;
  from_agent_name: string;
  to_agent_name: string;
  timestamp: number;
  status: 'pending' | 'verified';
  verified: boolean;
  sender_signature: string | null;
  receiver_signature: string | null;
  hash: string;
  previous_hash: string;
  payload_hash: string | null;
  content: string;
  content_preview: string;
  message_type: string;
  protocol: string;
  metadata: Record<string, unknown>;
}

export interface A2APeer {
  agent_id: string;
  agent_name: string;
  sent: number;
  received: number;
  pending: number;
  verified: number;
}

export interface A2AConversationListOpts {
  agent_id?: string;
}
