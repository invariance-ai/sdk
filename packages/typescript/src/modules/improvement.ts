import type { ResourcesModule } from './resources.js';

/**
 * Namespace module for agent optimization and evaluation resources.
 *
 * Provides organized access to evals, datasets, scorers, experiments,
 * prompt management, training data, and improvement suggestions.
 */
export class ImprovementModule {
  constructor(private _resources: ResourcesModule) {}

  /** Eval suites, cases, runs, and comparisons. */
  get evals() { return this._resources.evals; }
  /** Dataset CRUD and trace-based dataset generation. */
  get datasets() { return this._resources.datasets; }
  /** Scorer definitions for eval and monitor use. */
  get scorers() { return this._resources.scorers; }
  /** Prompt version control and diff. */
  get prompts() { return this._resources.prompts; }
  /** Experiment tracking and comparison. */
  get experiments() { return this._resources.experiments; }
  /** Training pair and trace flag management. */
  get training() { return this._resources.training; }
  /** Automated failure clustering. */
  get failureClusters() { return this._resources.failureClusters; }
  /** Optimization suggestions from the platform. */
  get suggestions() { return this._resources.suggestions; }
  /** Human annotation queue and scoring. */
  get annotations() { return this._resources.annotations; }
}
