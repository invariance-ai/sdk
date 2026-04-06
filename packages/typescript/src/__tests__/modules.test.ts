import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invariance } from '../client.js';
import { RunModule } from '../modules/run.js';
import { ResourcesModule } from '../modules/resources.js';
import { AdminModule } from '../modules/admin.js';
import { ProvenanceModule } from '../modules/provenance.js';
import { TracingModule } from '../modules/tracing.js';
import { MonitorsModule } from '../modules/monitors-module.js';
import { AnalysisModule } from '../modules/analysis.js';
import { ImprovementModule } from '../modules/improvement.js';

describe('workflow modules', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes all workflow modules', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(inv.run).toBeInstanceOf(RunModule);
    expect(inv.resources).toBeInstanceOf(ResourcesModule);
    expect(inv.admin).toBeInstanceOf(AdminModule);
    expect(inv.provenance).toBeInstanceOf(ProvenanceModule);
    expect(inv.tracing).toBeInstanceOf(TracingModule);
    expect(inv.monitors).toBeInstanceOf(MonitorsModule);
    expect(inv.monitoring).toBe(inv.monitors);
    expect(inv.analysis).toBeInstanceOf(AnalysisModule);
    expect(inv.improvement).toBeInstanceOf(ImprovementModule);
  });

  it('workflow module sub-namespaces delegate to resources', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    // admin
    expect(inv.admin.agents).toBe(inv.resources.agents);
    expect(inv.admin.identities).toBe(inv.resources.identities);
    expect(inv.admin.apiKeys).toBe(inv.resources.apiKeys);
    // analysis
    expect(inv.analysis.query).toBe(inv.resources.query);
    expect(inv.analysis.drift).toBe(inv.resources.drift);
    expect(inv.analysis.search).toBe(inv.resources.search);
    // improvement
    expect(inv.improvement.evals).toBe(inv.resources.evals);
    expect(inv.improvement.datasets).toBe(inv.resources.datasets);
    expect(inv.improvement.training).toBe(inv.resources.training);
    // monitors
    expect(inv.monitors.monitors).toBe(inv.resources.monitors);
    expect(inv.monitors.signals).toBe(inv.resources.signals);
    expect(inv.monitors.templates).toBe(inv.resources.templates);
    // provenance
    expect(inv.provenance.sessions).toBe(inv.resources.sessions);
    expect(inv.provenance.receipts).toBe(inv.resources.receipts);
    expect(inv.provenance.contracts).toBe(inv.resources.contracts);
    expect(inv.provenance.a2a).toBe(inv.resources.a2a);
  });
});
