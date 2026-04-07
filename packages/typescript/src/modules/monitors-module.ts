import type {
  Monitor, CreateMonitorBody, UpdateMonitorBody, MonitorValidateResult,
  MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview,
  MonitorDefinition, MonitorListOpts,
} from '../types/monitor.js';
import type { CreateSignalBody, Signal } from '../types/signal.js';
import type { ResourcesModule } from './resources.js';

export class MonitorsModule {
  constructor(private _resources: ResourcesModule) {}

  // Legacy-compatible monitor resource methods
  async list(opts?: MonitorListOpts): Promise<Monitor[]> {
    return this._resources.monitors.list(opts);
  }

  async get(id: string): Promise<Monitor> {
    return this._resources.monitors.get(id);
  }

  async create(body: CreateMonitorBody): Promise<Monitor> {
    return this._resources.monitors.create(body);
  }

  async update(id: string, body: UpdateMonitorBody): Promise<Monitor> {
    return this._resources.monitors.update(id, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this._resources.monitors.delete(id);
  }

  async evaluate(id: string): Promise<MonitorEvaluateResult> {
    return this._resources.monitors.evaluate(id);
  }

  async evaluateAll(): Promise<unknown> {
    return this._resources.monitors.evaluateAll();
  }

  async validate(definition: MonitorDefinition): Promise<MonitorValidateResult> {
    return this._resources.monitors.validate(definition);
  }

  async compilePreview(rule: string): Promise<MonitorCompilePreview> {
    return this._resources.monitors.compilePreview(rule);
  }

  async listEvents(opts?: MonitorEventsQuery): Promise<{ events: MonitorSignal[]; next_cursor?: string }> {
    return this._resources.monitors.listEvents(opts);
  }

  async acknowledgeEvent(eventId: string): Promise<Record<string, unknown>> {
    return this._resources.monitors.acknowledgeEvent(eventId);
  }

  get monitors() { return this._resources.monitors; }
  get signals() { return this._resources.signals; }
  get templates() { return this._resources.templates; }
  get status() { return this._resources.status; }

  /** Emit a signal with source='emit'. */
  async emitSignal(body: CreateSignalBody): Promise<Signal> {
    return this._resources.signals.create(body);
  }
}
