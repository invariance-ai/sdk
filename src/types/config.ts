import type { InvarianceError } from '../errors.js';

export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
  privateKey?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  onError?: (error: InvarianceError) => void;
}

export interface Action {
  agent?: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}
