import type { ResourcesModule } from './resources.js';

export class ImprovementModule {
  constructor(private _resources: ResourcesModule) {}

  // ── Product-facing capability names ──

  /** Evaluation suites, runs, comparisons, and regressions */
  get evaluations() { return this._resources.evals; }

  /** Datasets, rows, versions, and data imports */
  get data() { return this._resources.datasets; }

  /** Scoring functions and score configuration */
  get scoring() { return this._resources.scorers; }

  /** Prompt templates, versions, and diffs */
  get prompts() { return this._resources.prompts; }

  /** Experiment runs, comparisons, and orchestration */
  get experiments() { return this._resources.experiments; }

  /** Training pairs and candidate generation */
  get training() { return this._resources.training; }

  /** Failure clusters and optimization suggestions */
  get recommendations() {
    return {
      clusters: this._resources.failureClusters,
      suggestions: this._resources.suggestions,
    };
  }

  /** Human labels, flags, and feedback */
  get annotations() { return this._resources.annotations; }

  // ── Legacy aliases (deprecated — use product names above) ──

  /** @deprecated Use `evaluations` instead */
  get evals() { return this._resources.evals; }
  /** @deprecated Use `data` instead */
  get datasets() { return this._resources.datasets; }
  /** @deprecated Use `scoring` instead */
  get scorers() { return this._resources.scorers; }
  /** @deprecated Use `recommendations.clusters` instead */
  get failureClusters() { return this._resources.failureClusters; }
  /** @deprecated Use `recommendations.suggestions` instead */
  get suggestions() { return this._resources.suggestions; }
}
