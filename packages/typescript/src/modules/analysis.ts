import type { ResourcesModule } from './resources.js';

/**
 * Namespace module for analysis and query resources.
 *
 * Provides organized access to trace querying, drift detection,
 * full-text search, and usage analytics.
 */
export class AnalysisModule {
  constructor(private _resources: ResourcesModule) {}

  /** Structured and trace query operations. */
  get query() { return this._resources.query; }
  /** Natural-language query interface. */
  get nlQuery() { return this._resources.nlQuery; }
  /** Behavioral drift detection and comparison. */
  get drift() { return this._resources.drift; }
  /** Full-text search across traces and sessions. */
  get search() { return this._resources.search; }
  /** Usage metrics and billing data. */
  get usage() { return this._resources.usage; }
}
