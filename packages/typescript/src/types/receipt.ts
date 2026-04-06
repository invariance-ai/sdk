export interface Receipt {
  id: string;
  sessionId: string;
  agent: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  timestamp: number;
  hash: string;
  previousHash: string;
  signature: string;
  contractId?: string;
  counterAgentId?: string;
  counterSignature?: string;
}

export interface ReceiptQuery {
  sessionId?: string;
  action?: string;
  agent?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  offset?: number;
}
