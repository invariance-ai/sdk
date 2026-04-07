import type { ResourcesModule } from './resources.js';

/**
 * Namespace module for administrative resources.
 *
 * Provides organized access to agent management, identity operations,
 * and API key administration.
 */
export class AdminModule {
  constructor(private _resources: ResourcesModule) {}

  /** Agent CRUD, templates, and policies. */
  get agents() { return this._resources.agents; }
  /** Multi-identity lookup. */
  get identities() { return this._resources.identities; }
  /** Developer/org identity signup and agent registration. */
  get identity() { return this._resources.identity; }
  /** API key management. */
  get apiKeys() { return this._resources.apiKeys; }
}
