import { HttpClient } from './http.js';
import { Batcher } from './batcher.js';
import { Session } from './session.js';
import { InvarianceError } from './errors.js';
import { generateKeypair, getPublicKey, deriveAgentKeypair } from './crypto.js';
import { MonitorPoller } from './monitor-poller.js';
import { SignalPoller } from './signal-poller.js';

import { ResourcesModule } from './modules/resources.js';
import { AdminModule } from './modules/admin.js';
import { ProvenanceModule } from './modules/provenance.js';
import { TracingModule } from './modules/tracing.js';
import { MonitorsModule } from './modules/monitors-module.js';
import { AnalysisModule } from './modules/analysis.js';
import { ImprovementModule } from './modules/improvement.js';
import { RunModule } from './modules/run.js';

import type { InvarianceConfig, Action } from './types/config.js';
import type { Receipt } from './types/receipt.js';
import type { SessionCreateOpts } from './types/session.js';

declare const __SDK_VERSION__: string;

const DEFAULT_API_URL = 'https://api.invariance.dev';
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 50;

export class Invariance {
  static readonly version: string = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '1.0.0';

  private http: HttpClient;
  private batcher: Batcher;
  private privateKey?: string;
  private pendingSessionCloses: Promise<void>[] = [];
  private monitorPoller: MonitorPoller | null = null;
  private signalPoller: SignalPoller | null = null;

  // ── Workflow modules ──
  readonly run: RunModule;
  readonly provenance: ProvenanceModule;
  readonly tracing: TracingModule;
  readonly monitors: MonitorsModule;

  // ── Namespace modules (organized access to resources) ──
  readonly analysis: AnalysisModule;
  readonly improvement: ImprovementModule;
  readonly admin: AdminModule;

  // ── Raw resource access (advanced) ──
  readonly resources: ResourcesModule;

  private constructor(config: InvarianceConfig) {
    if (!config.apiKey) {
      throw new InvarianceError('INIT_FAILED', 'apiKey is required');
    }

    this.privateKey = config.privateKey;

    if (this.privateKey && !/^[0-9a-f]{64}$/i.test(this.privateKey)) {
      throw new InvarianceError('INVALID_KEY', 'privateKey must be a 32-byte hex string (64 characters)');
    }

    const apiUrl = config.apiUrl ?? process.env.INVARIANCE_API_URL ?? DEFAULT_API_URL;

    this.http = new HttpClient({
      baseUrl: apiUrl,
      apiKey: config.apiKey,
      onError: config.onError,
    });

    this.batcher = new Batcher({
      http: this.http,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      maxQueueSize: config.maxQueueSize ?? 1000,
      onError: config.onError,
    });

    // Initialize all resources
    this.resources = new ResourcesModule(this.http);

    // Initialize workflow modules
    this.run = new RunModule(this.resources, {
      agent: config.agent,
      privateKey: this.privateKey,
      instrumentation: config.instrumentation,
      sessionFactory: (opts) => this.session(opts),
      batcherEnqueue: (receipt) => this.batcher.enqueue(receipt),
    });
    this.provenance = new ProvenanceModule(this.resources, (opts) => this.session(opts));
    this.tracing = new TracingModule(this.resources, { agent: config.agent });
    this.monitors = new MonitorsModule(this.resources);
    this.analysis = new AnalysisModule(this.resources);
    this.improvement = new ImprovementModule(this.resources);
    this.admin = new AdminModule(this.resources);

    // Start signal or monitor polling if configured
    if (config.onSignal && (config.signalPollIntervalMs ?? config.monitorPollIntervalMs)) {
      this.signalPoller = new SignalPoller({
        signals: this.resources.signals,
        intervalMs: config.signalPollIntervalMs ?? config.monitorPollIntervalMs!,
        onSignal: config.onSignal,
        onError: config.onError ? (err) => config.onError!(err as InvarianceError) : undefined,
      });
      this.signalPoller.start();
    } else if (config.onMonitorTrigger && config.monitorPollIntervalMs) {
      this.monitorPoller = new MonitorPoller({
        monitors: this.resources.monitors,
        intervalMs: config.monitorPollIntervalMs,
        onEvent: config.onMonitorTrigger,
        onError: config.onError ? (err) => config.onError!(err as InvarianceError) : undefined,
      });
      this.monitorPoller.start();
    }
  }

  /**
   * Create a new Invariance client.
   */
  static init(config: InvarianceConfig): Invariance {
    return new Invariance(config);
  }

  /**
   * Generate a new Ed25519 keypair.
   */
  static generateKeypair(): { privateKey: string; publicKey: string } {
    return generateKeypair();
  }

  /**
   * Derive the public key from a private key.
   */
  static getPublicKey(privateKey: string): string {
    return getPublicKey(privateKey);
  }

  /**
   * Derive a child keypair for an identity (e.g., "org/agent-name").
   */
  static deriveKeypair(ownerPrivateKey: string, identity: string): { privateKey: string; publicKey: string } {
    return deriveAgentKeypair(ownerPrivateKey, identity);
  }

  /**
   * Create a new session. The session is lazily initialized — the backend
   * POST happens in the background, and .record() awaits it.
   */
  session(opts: SessionCreateOpts): Session {
    return new Session({
      agent: opts.agent,
      name: opts.name,
      id: opts.id,
      privateKey: this.privateKey,
      enqueue: (receipt) => this.batcher.enqueue(receipt),
      onCreate: (createOpts) => this.resources.sessions.create(createOpts).then(() => {}),
      onClose: (id, status, closeHash) => {
        const promise = this.batcher.flush().then(() =>
          this.resources.sessions.close(id, status, closeHash).then(() => {}),
        );
        this.pendingSessionCloses.push(promise);
        promise.finally(() => {
          const idx = this.pendingSessionCloses.indexOf(promise);
          if (idx !== -1) this.pendingSessionCloses.splice(idx, 1);
        });
        return promise;
      },
    });
  }

  /**
   * Create a session and await its backend creation before returning.
   */
  async createSession(opts: SessionCreateOpts): Promise<Session> {
    const s = this.session(opts);
    await s.ready;
    return s;
  }

  /**
   * Convenience: record a single action (creates a temporary session).
   */
  async record(action: Action & { agent: string; name?: string }): Promise<Receipt> {
    const s = this.session({ agent: action.agent, name: action.name ?? action.action });
    const receipt = await s.record(action);
    await s.end();
    return receipt;
  }

  /**
   * Wrap a function call: execute it, then record a receipt with the result.
   */
  async wrap<T>(
    action: Omit<Action, 'output' | 'error'> & { agent: string; name?: string },
    fn: () => T | Promise<T>,
  ): Promise<{ result: T; receipt: Receipt }> {
    const s = this.session({ agent: action.agent, name: action.name ?? action.action });
    const result = await s.wrap(action, fn);
    await s.end();
    return result;
  }

  /**
   * Flush all pending receipts to the backend.
   */
  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  /**
   * Gracefully shut down: flush receipts, await pending session closes.
   */
  async shutdown(): Promise<void> {
    this.signalPoller?.stop();
    this.monitorPoller?.stop();
    await this.batcher.shutdown();
    await Promise.allSettled(this.pendingSessionCloses);
  }
}
