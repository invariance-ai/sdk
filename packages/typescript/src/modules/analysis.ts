import type { ResourcesModule } from './resources.js';

export class AnalysisModule {
  constructor(private _resources: ResourcesModule) {}

  get query() { return this._resources.query; }
  get nlQuery() { return this._resources.nlQuery; }
  get drift() { return this._resources.drift; }
  get search() { return this._resources.search; }
  get usage() { return this._resources.usage; }
}
