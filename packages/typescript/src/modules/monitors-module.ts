import type { CreateSignalBody, Signal } from '../types/signal.js';
import type { ResourcesModule } from './resources.js';

export class MonitorsModule {
  constructor(private _resources: ResourcesModule) {}

  get monitors() { return this._resources.monitors; }
  get signals() { return this._resources.signals; }
  get templates() { return this._resources.templates; }
  get status() { return this._resources.status; }

  /** Emit a signal with source='emit'. */
  async emitSignal(body: CreateSignalBody): Promise<Signal> {
    return this._resources.signals.create(body);
  }
}
