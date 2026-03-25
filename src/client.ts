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
  }

  /**
   * Create a new Invariance client.
   */
  static init(config: InvarianceConfig): Invariance {
    return new Invariance(config);
  }

  private normalizeTraceVerifyResult(payload: unknown): { verified: boolean; errors: string[] } {
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      if (typeof record.verified === 'boolean') {
        return {
          verified: record.verified,
          errors: Array.isArray(record.errors) ? record.errors.filter((item): item is string => typeof item === 'string') : [],
        };
      }
      if (typeof record.valid === 'boolean') {
        return {
          verified: record.valid,
          errors: typeof record.error === 'string' ? [record.error] : [],
        };
      }
    }

    return { verified: false, errors: ['Invalid verification response'] };
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

  async createAgent(name: string) {
    return this.agents.create({ name });
  }

  async listAgents() {
    return this.agents.list();
  }

  async getAgent(id: string) {
    return this.agents.get(id);
  }

  async getAgentMetrics() {
    const payload = await this.agents.metrics();
    return Array.isArray(payload.metrics) ? payload.metrics : payload;
  }

  async getAgentTemplates(agentId: string) {
    return this.agents.getTemplates(agentId);
  }

  async upsertAgentTemplates(agentId: string, templates: Parameters<AgentsResource['upsertTemplates']>[1]) {
    return this.agents.upsertTemplates(agentId, templates);
  }

  async getAgentPolicies(agentId: string) {
    return this.agents.getPolicies(agentId);
  }

  async upsertAgentPolicies(agentId: string, policies: Parameters<AgentsResource['upsertPolicies']>[1]) {
    return this.agents.upsertPolicies(agentId, policies);
  }

  async signup(opts: Parameters<IdentityResource['signup']>[0]) {
    return this.identity.signup(opts);
  }

  async createOrg(name: string) {
    return this.identity.createOrg({ name });
  }

  async registerAgentIdentity(owner: string, opts: Parameters<IdentityResource['registerAgent']>[1]) {
    return this.identity.registerAgent(owner, opts);
  }

  async lookupAgentIdentity(owner: string, name: string) {
    return this.identity.lookup(owner, name);
  }

  async listSessions(opts?: Parameters<SessionsResource['list']>[0]) {
    return this.sessions.list(opts);
  }

  async getSession(id: string) {
    return this.sessions.get(id);
  }

  async getReceipts(sessionId: string, opts?: Omit<Parameters<ReceiptsResource['query']>[0], 'sessionId'>) {
    return this.receipts.query({ sessionId, limit: 1000, ...opts });
  }

  async verifySession(id: string) {
    return this.sessions.verify(id);
  }

  async getAnomalyFeed(opts?: Parameters<TraceResource['getAnomalies']>[0]) {
    const payload = await this.trace.getAnomalies(opts);
    return payload.anomalies;
  }

  async getTraceNodes(sessionId: string) {
    const payload = await this.trace.getSessionNodes(sessionId);
    return payload.nodes;
  }

  async getReplay(sessionId: string) {
    return this.trace.getReplay(sessionId);
  }

  async getNodeSnapshot(nodeId: string) {
    return this.trace.getNodeSnapshot(nodeId);
  }

  async getCausalChain(nodeId: string) {
    return this.trace.getCausalChain(nodeId);
  }

  async getDiffPaths(nodeIdA: string, nodeIdB: string) {
    return this.trace.diffNodes(nodeIdA, nodeIdB);
  }

  async getDependencyContext(nodeId: string) {
    return this.trace.getDependencyContext(nodeId);
  }

  async getNarrative(sessionId: string) {
    return this.trace.getNarrative(sessionId);
  }

  async getPatterns(opts?: Parameters<TraceResource['getPatterns']>[0]) {
    const payload = await this.trace.getPatterns(opts);
    return payload.patterns;
  }

  async getGraphSnapshot(opts?: Parameters<TraceResource['getGraphSnapshot']>[0]) {
    return this.trace.getGraphSnapshot(opts);
  }

  async generateReplay(sessionId: string, opts: Parameters<TraceResource['generateReplay']>[1]) {
    return this.trace.generateReplay(sessionId, opts);
  }

  async generateAudit(sessionId: string, nodeId?: string) {
    return this.trace.generateAudit(sessionId, nodeId);
  }

  async verifyTraceChain(sessionId: string) {
    return this.normalizeTraceVerifyResult(await this.trace.verifyChain(sessionId));
  }

  async searchGlobal(query: string) {
    return this.search.query(query);
  }

  async getApiDocs() {
    return this.http.get('/v1/docs');
  }

  async listApiKeys() {
    return this.apiKeys.list();
  }

  async createApiKey(body?: Parameters<ApiKeysResource['create']>[0]) {
    return this.apiKeys.create(body);
  }

  async revokeApiKey(id: string) {
    return this.apiKeys.revoke(id);
  }

  async getUsageEvents(opts?: Parameters<UsageResource['query']>[0]) {
    return this.usage.query(opts);
  }

  async getA2AConversations(opts?: Parameters<A2AResource['conversations']>[0]) {
    return this.a2a.conversations(opts);
  }

  async getA2AConversation(conversationId: string) {
    return this.a2a.conversation(conversationId);
  }

  async getA2AMessages(conversationId: string) {
    return this.a2a.messages(conversationId);
  }

  async getA2APeers(agentId: string) {
    return this.a2a.peers(agentId);
  }

  async getAgentIdentities() {
    return this.identities.list();
  }

  async getAgentIdentity(id: string) {
    return this.identities.get(id);
  }

  async getContracts() {
    return this.contracts.list();
  }

  async getContract(id: string) {
    return this.contracts.get(id);
  }

  async getDriftCatches() {
    return this.drift.catches();
  }

  async getDriftComparison(opts?: Parameters<DriftResource['comparison']>[0]) {
    return this.drift.comparison(opts);
  }

  async getMonitors(opts?: Parameters<MonitorsResource['list']>[0]) {
    return this.monitors.list(opts);
  }

  async createMonitor(body: Parameters<MonitorsResource['create']>[0]) {
    return this.monitors.create(body);
  }

  async updateMonitor(id: string, body: Parameters<MonitorsResource['update']>[1]) {
    return this.monitors.update(id, body);
  }

  async deleteMonitor(id: string) {
    return this.monitors.delete(id);
  }

  async evaluateMonitor(id: string) {
    return this.monitors.evaluate(id);
  }

  async getMonitorEvents(opts?: Parameters<MonitorsResource['listEvents']>[0]) {
    const payload = await this.monitors.listEvents(opts);
    return payload.events;
  }

  async acknowledgeMonitorEvent(eventId: string) {
    return this.monitors.acknowledgeEvent(eventId);
  }

  async getTrainingPairs(opts?: Parameters<TrainingResource['list']>[0]) {
    return this.training.list(opts);
  }

  async createTrainingPair(body: Parameters<TrainingResource['create']>[0]) {
    return this.training.create(body);
  }

  async updateTrainingPair(id: string, body: Parameters<TrainingResource['update']>[1]) {
    return this.training.update(id, body);
  }

  async deleteTrainingPair(id: string) {
    return this.training.delete(id);
  }

  async createTraceFlag(body: Parameters<TrainingResource['createFlag']>[0]) {
    return this.training.createFlag(body);
  }

  async getTraceFlags(opts?: Parameters<TrainingResource['listFlags']>[0]) {
    return this.training.listFlags(opts);
  }

  async updateTraceFlag(id: string, body: Parameters<TrainingResource['updateFlag']>[1]) {
    return this.training.updateFlag(id, body);
  }

  async deleteTraceFlag(id: string) {
    return this.training.deleteFlag(id);
  }

  async getTraceFlagStats() {
    return this.training.flagStats();
  }

  async askQuestion(question: string, scope?: Parameters<QueryResource['ask']>[1]) {
    return this.query.ask(question, scope);
  }

  async askQuery(question: string, opts?: Parameters<NLQueryResource['ask']>[1]) {
    return this.nlQuery.ask(question, opts);
  }

  async getLiveStatus() {
    return this.status.snapshot();
  }

  async connectLiveStatus(onEvent: Parameters<StatusResource['connect']>[0]) {
    return this.status.connect(onEvent);
  }

  async getEvalSuites(opts?: Parameters<EvalsResource['listSuites']>[0]) {
    return this.evals.listSuites(opts);
  }

  async createEvalSuite(body: Parameters<EvalsResource['createSuite']>[0]) {
    return this.evals.createSuite(body);
  }

  async getEvalSuite(id: string) {
    return this.evals.getSuite(id);
  }

  async updateEvalSuite(id: string, body: Parameters<EvalsResource['updateSuite']>[1]) {
    return this.evals.updateSuite(id, body);
  }

  async deleteEvalSuite(id: string) {
    return this.evals.deleteSuite(id);
  }

  async getEvalCases(suiteId: string) {
    return this.evals.listCases(suiteId);
  }

  async createEvalCase(suiteId: string, body: Parameters<EvalsResource['createCase']>[1]) {
    return this.evals.createCase(suiteId, body);
  }

  async updateEvalCase(id: string, body: Parameters<EvalsResource['updateCase']>[1]) {
    return this.evals.updateCase(id, body);
  }

  async deleteEvalCase(id: string) {
    return this.evals.deleteCase(id);
  }

  async triggerEvalRun(suiteId: string, body: Parameters<EvalsResource['triggerRun']>[1]) {
    return this.evals.triggerRun(suiteId, body);
  }

  async getEvalRuns(opts?: Parameters<EvalsResource['listRuns']>[0]) {
    return this.evals.listRuns(opts);
  }

  async getEvalRun(id: string) {
    return this.evals.getRun(id);
  }

  async compareEvalRuns(suiteId: string, runA: string, runB: string) {
    return this.evals.compare(suiteId, runA, runB);
  }

  async getFailureClusters(opts?: Parameters<FailureClustersResource['list']>[0]) {
    return this.failureClusters.list(opts);
  }

  async getFailureCluster(id: string) {
    return this.failureClusters.get(id);
  }

  async createFailureCluster(body: Parameters<FailureClustersResource['create']>[0]) {
    return this.failureClusters.create(body);
  }

  async updateFailureCluster(id: string, body: Parameters<FailureClustersResource['update']>[1]) {
    return this.failureClusters.update(id, body);
  }

  async deleteFailureCluster(id: string) {
    return this.failureClusters.delete(id);
  }

  async addFailureClusterMember(clusterId: string, body: Parameters<FailureClustersResource['addMember']>[1]) {
    return this.failureClusters.addMember(clusterId, body);
  }

  async getSuggestions(opts?: Parameters<SuggestionsResource['list']>[0]) {
    return this.suggestions.list(opts);
  }

  async createSuggestion(body: Parameters<SuggestionsResource['create']>[0]) {
    return this.suggestions.create(body);
  }

  async updateSuggestion(id: string, body: Parameters<SuggestionsResource['update']>[1]) {
    return this.suggestions.update(id, body);
  }

  async deleteSuggestion(id: string) {
    return this.suggestions.delete(id);
  }

  async listTemplates() {
    return this.templates.list();
  }

  async applyTemplate(id: string, opts?: Parameters<TemplatesResource['apply']>[1]) {
    return this.templates.apply(id, opts);
  }

  async listA2AConversations(opts?: Parameters<A2AResource['conversations']>[0]) {
    return this.getA2AConversations(opts);
  }

  async listIdentities() {
    return this.getAgentIdentities();
  }

  async getIdentityRecord(id: string) {
    return this.getAgentIdentity(id);
  }

  async listContracts() {
    return this.getContracts();
  }

  async listMonitors(opts?: Parameters<MonitorsResource['list']>[0]) {
    return this.getMonitors(opts);
  }

  async listMonitorEvents(opts?: Parameters<MonitorsResource['listEvents']>[0]) {
    return this.getMonitorEvents(opts);
  }

  async listTrainingPairs(opts?: Parameters<TrainingResource['list']>[0]) {
    return this.getTrainingPairs(opts);
  }

  async queryGraphQuestion(question: string, scope?: Parameters<QueryResource['ask']>[1]) {
    return this.askQuestion(question, scope);
  }

  async ask(question: string, opts?: Parameters<NLQueryResource['ask']>[1]) {
    return this.askQuery(question, opts);
  }

  async listEvalCases(suiteId: string) {
    return this.getEvalCases(suiteId);
  }

  async listEvalRuns(opts?: Parameters<EvalsResource['listRuns']>[0]) {
    return this.getEvalRuns(opts);
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
