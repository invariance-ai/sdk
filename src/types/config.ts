import type { InvarianceError } from '../errors.js';
import type { MonitorSignal } from './monitor.js';
import type { Signal } from './signal.js';

export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
  privateKey?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  onError?: (error: InvarianceError) => void;
  /**
   * @deprecated Use `onSignal` instead.
   * Callback fired when a monitor event is detected via polling.
   */
  onMonitorTrigger?: (event: MonitorSignal) => void;
  /**
   * @deprecated Use `signalPollIntervalMs` instead.
   * Polling interval in ms for monitor events. Set to enable polling.
   */
  monitorPollIntervalMs?: number;
  /** Callback fired when a signal is detected via polling. */
  onSignal?: (signal: Signal) => void;
  /** Polling interval in ms for signals. Set to enable polling. */
  signalPollIntervalMs?: number;
}

export interface Action {
  agent?: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}
