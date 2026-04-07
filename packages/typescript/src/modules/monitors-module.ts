import type { ResourcesModule } from './resources.js';

export class MonitorsModule {
  constructor(private _resources: ResourcesModule) {}

  /** Access the underlying monitors resource. */
  get monitors() { return this._resources.monitors; }
  /** Access the signals resource. */
  get signals() { return this._resources.signals; }
  /** Access the templates resource. */
  get templates() { return this._resources.templates; }
}
