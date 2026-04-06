import type { ResourcesModule } from './resources.js';

export class ImprovementModule {
  constructor(private _resources: ResourcesModule) {}

  get evals() { return this._resources.evals; }
  get datasets() { return this._resources.datasets; }
  get scorers() { return this._resources.scorers; }
  get prompts() { return this._resources.prompts; }
  get experiments() { return this._resources.experiments; }
  get training() { return this._resources.training; }
  get failureClusters() { return this._resources.failureClusters; }
  get suggestions() { return this._resources.suggestions; }
  get annotations() { return this._resources.annotations; }
}
