import { HttpClient } from './http.js';
import { Batcher } from './batcher.js';
import { Session } from './session.js';
import { InvarianceError } from './errors.js';
import { generateKeypair, getPublicKey, deriveAgentKeypair } from './crypto.js';

import { IdentityResource } from './resources/identity.js';
import { AgentsResource } from './resources/agents.js';
import { SessionsResource } from './resources/sessions.js';
import { ReceiptsResource } from './resources/receipts.js';
import { ContractsResource } from './resources/contracts.js';
import { A2AResource } from './resources/a2a.js';
import { TraceResource } from './resources/trace.js';
import { QueryResource } from './resources/query.js';
import { MonitorsResource } from './resources/monitors.js';
import { DriftResource } from './resources/drift.js';
import { TrainingResource } from './resources/training.js';
import { TemplatesResource } from './resources/templates.js';
import { ApiKeysResource } from './resources/api-keys.js';
import { UsageResource } from './resources/usage.js';
import { SearchResource } from './resources/search.js';
import { StatusResource } from './resources/status.js';
import { NLQueryResource } from './resources/nl-query.js';
import { IdentitiesResource } from './resources/identities.js';
import { EvalsResource } from './resources/evals.js';
import { FailureClustersResource } from './resources/failure-clusters.js';
import { SuggestionsResource } from './resources/suggestions.js';
import { DocsResource } from './resources/docs.js';

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

  // Resource namespaces
  readonly identity: IdentityResource;
  readonly agents: AgentsResource;
  readonly sessions: SessionsResource;
  readonly receipts: ReceiptsResource;
  readonly contracts: ContractsResource;
  readonly a2a: A2AResource;
  readonly trace: TraceResource;
  readonly query: QueryResource;
  readonly monitors: MonitorsResource;
  readonly drift: DriftResource;
  readonly training: TrainingResource;
  readonly templates: TemplatesResource;
  readonly apiKeys: ApiKeysResource;
  readonly usage: UsageResource;
  readonly search: SearchResource;
  readonly status: StatusResource;
  readonly nlQuery: NLQueryResource;
  readonly identities: IdentitiesResource;
  readonly evals: EvalsResource;
  readonly failureClusters: FailureClustersResource;
  readonly suggestions: SuggestionsResource;
  readonly docs: DocsResource;

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

    // Initialize all resource modules
    this.identity = new IdentityResource(this.http);
    this.agents = new AgentsResource(this.http);
    this.sessions = new SessionsResource(this.http);
    this.receipts = new ReceiptsResource(this.http);
    this.contracts = new ContractsResource(this.http);
    this.a2a = new A2AResource(this.http);
    this.trace = new TraceResource(this.http);
    this.query = new QueryResource(this.http);
    this.monitors = new MonitorsResource(this.http);
    this.drift = new DriftResource(this.http);
    this.training = new TrainingResource(this.http);
    this.templates = new TemplatesResource(this.http);
    this.apiKeys = new ApiKeysResource(this.http);
    this.usage = new UsageResource(this.http);
    this.search = new SearchResource(this.http);
    this.status = new StatusResource(this.http);
    this.nlQuery = new NLQueryResource(this.http);
    this.identities = new IdentitiesResource(this.http);
    this.evals = new EvalsResource(this.http);
    this.failureClusters = new FailureClustersResource(this.http);
    this.suggestions = new SuggestionsResource(this.http);
    this.docs = new DocsResource(this.http);
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
      onCreate: (createOpts) => this.sessions.create(createOpts).then(() => {}),
      onClose: (id, status, closeHash) => {
        const promise = this.batcher.flush().then(() =>
          this.sessions.close(id, status, closeHash).then(() => {}),
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
    await this.batcher.shutdown();
    await Promise.allSettled(this.pendingSessionCloses);
  }
}
