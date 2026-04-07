import type { ResourcesModule } from './resources.js';

export class AdminModule {
  constructor(private _resources: ResourcesModule) {}

  get agents() { return this._resources.agents; }
  get identities() { return this._resources.identities; }
  get identity() { return this._resources.identity; }
  get apiKeys() { return this._resources.apiKeys; }
}
