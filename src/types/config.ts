import type { InvarianceError } from '../errors.js';
import type { MonitorSignal } from './monitor.js';

export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
  privateKey?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  onError?: (error: InvarianceError) => void;
  /** Callback fired when a monitor event is detected via polling. */
  onMonitorTrigger?: (event: MonitorSignal) => void;
  /** Polling interval in ms for monitor events. Set to enable polling. */
  monitorPollIntervalMs?: number;
}

export interface Action {
  agent?: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}
