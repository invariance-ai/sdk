import type {
  Monitor, CreateMonitorBody, UpdateMonitorBody, MonitorValidateResult,
  MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview,
  MonitorDefinition, MonitorListOpts,
} from '../types/monitor.js';
import type { CreateSignalBody, Signal } from '../types/signal.js';
import type { ResourcesModule } from './resources.js';

export class MonitorsModule {
  constructor(private _resources: ResourcesModule) {}

  private static _passthroughWarned = false;
  private _warnPassthrough(method: string): void {
    if (!MonitorsModule._passthroughWarned) {
      MonitorsModule._passthroughWarned = true;
      console.warn(`[invariance] monitors.${method}() is deprecated. Use monitors.monitors.${method}() instead.`);
    }
  }

  /** @deprecated Use `monitors.monitors.list()` instead. */
  async list(opts?: MonitorListOpts): Promise<Monitor[]> {
    this._warnPassthrough('list');
    return this._resources.monitors.list(opts);
  }

  /** @deprecated Use `monitors.monitors.get()` instead. */
  async get(id: string): Promise<Monitor> {
    this._warnPassthrough('get');
    return this._resources.monitors.get(id);
  }

  /** @deprecated Use `monitors.monitors.create()` instead. */
  async create(body: CreateMonitorBody): Promise<Monitor> {
    this._warnPassthrough('create');
    return this._resources.monitors.create(body);
  }

  /** @deprecated Use `monitors.monitors.update()` instead. */
  async update(id: string, body: UpdateMonitorBody): Promise<Monitor> {
    this._warnPassthrough('update');
    return this._resources.monitors.update(id, body);
  }

  /** @deprecated Use `monitors.monitors.delete()` instead. */
  async delete(id: string): Promise<{ ok: boolean }> {
    this._warnPassthrough('delete');
    return this._resources.monitors.delete(id);
  }

  /** @deprecated Use `monitors.monitors.evaluate()` instead. */
  async evaluate(id: string): Promise<MonitorEvaluateResult> {
    this._warnPassthrough('evaluate');
    return this._resources.monitors.evaluate(id);
  }

  /** @deprecated Use `monitors.monitors.evaluateAll()` instead. */
  async evaluateAll(): Promise<unknown> {
    this._warnPassthrough('evaluateAll');
    return this._resources.monitors.evaluateAll();
  }

  /** @deprecated Use `monitors.monitors.validate()` instead. */
  async validate(definition: MonitorDefinition): Promise<MonitorValidateResult> {
    this._warnPassthrough('validate');
    return this._resources.monitors.validate(definition);
  }

  /** @deprecated Use `monitors.monitors.compilePreview()` instead. */
  async compilePreview(rule: string): Promise<MonitorCompilePreview> {
    this._warnPassthrough('compilePreview');
    return this._resources.monitors.compilePreview(rule);
  }

  /** @deprecated Use `monitors.monitors.listEvents()` instead. */
  async listEvents(opts?: MonitorEventsQuery): Promise<{ events: MonitorSignal[]; next_cursor?: string }> {
    this._warnPassthrough('listEvents');
    return this._resources.monitors.listEvents(opts);
  }

  /** @deprecated Use `monitors.monitors.acknowledgeEvent()` instead. */
  async acknowledgeEvent(eventId: string): Promise<Record<string, unknown>> {
    this._warnPassthrough('acknowledgeEvent');
    return this._resources.monitors.acknowledgeEvent(eventId);
  }

  /** Access the underlying monitors resource. */
  get monitors() { return this._resources.monitors; }
  /** Access the signals resource. */
  get signals() { return this._resources.signals; }
  /** Access the templates resource. */
  get templates() { return this._resources.templates; }

  /**
   * Emit a signal with source='emit'.
   * @deprecated Use `run.signal()` for in-run signals or `resources.signals.create()` for standalone signals.
   */
  async emitSignal(body: CreateSignalBody): Promise<Signal> {
    if (!MonitorsModule._emitSignalWarned) {
      MonitorsModule._emitSignalWarned = true;
      console.warn('[invariance] monitors.emitSignal() is deprecated. Use run.signal() or resources.signals.create() instead.');
    }
    return this._resources.signals.create(body);
  }

  private static _emitSignalWarned = false;
}
