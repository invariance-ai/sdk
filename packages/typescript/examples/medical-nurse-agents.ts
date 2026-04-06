/**
 * Multi-agent medical nurse workflow
 *
 * Three nurse agents collaborate on a patient case:
 *   1. Triage nurse — decides urgency and routes to specialist
 *   2. Chart nurse  — fetches patient chart via tool call
 *   3. Safety nurse — runs constraint checks before discharge
 *
 * Each step emits trace events with custom_attributes so monitors can
 * target high-risk decisions, PII-bearing tool calls, and failed safety checks.
 *
 * Usage:
 *   INVARIANCE_API_KEY=inv_xxx npx tsx examples/medical-nurse-agents.ts
 */

import { Invariance } from '../src/index.js';
import {
  buildDecisionEvent,
  buildToolInvocationEvent,
  buildConstraintCheckEvent,
  buildHandoffEvent,
} from '../src/trace-builders.js';

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY!,
});

const SESSION_ID = `nurse-session-${Date.now()}`;

const TRIAGE_AGENT  = 'hospital/triage-nurse';
const CHART_AGENT   = 'hospital/chart-nurse';
const SAFETY_AGENT  = 'hospital/safety-nurse';

async function run() {
  // ── Step 1: Triage decision ──
  // The triage nurse evaluates symptoms and routes to the chart nurse.
  // Monitors can trigger on custom_attributes.risk_tier = 'high'.

  const triageEvent = buildDecisionEvent({
    session_id: SESSION_ID,
    agent_id: TRIAGE_AGENT,
    candidates: ['low_acuity_discharge', 'standard_workup', 'emergency_escalation'],
    chosen: 'standard_workup',
    reasoning: 'Patient presents with chest pain — requires chart review before disposition.',
    tags: ['triage', 'chest_pain'],
    custom_attributes: {
      risk_tier: 'high',
      chief_complaint: 'chest_pain',
    },
    custom_headers: {
      'x-monitor-kind': 'clinical_decision',
    },
  });

  const { nodes: [triageNode] } = await inv.trace.submitEvents(triageEvent);
  console.log('Triage decision submitted:', triageNode.id);

  // ── Step 2: Handoff to chart nurse ──

  const handoffEvent = buildHandoffEvent({
    session_id: SESSION_ID,
    agent_id: TRIAGE_AGENT,
    parent_id: triageNode.id,
    target_agent_id: CHART_AGENT,
    task: 'Fetch and review patient chart for chest pain workup',
    context: { chief_complaint: 'chest_pain' },
  });

  const { nodes: [handoffNode] } = await inv.trace.submitEvents(handoffEvent);
  console.log('Handoff submitted:', handoffNode.id);

  // ── Step 3: Chart lookup tool call ──
  // The chart nurse calls the EHR system. The tool call is logged as a
  // tool_invocation so monitors can detect PII access patterns.

  const chartEvent = buildToolInvocationEvent({
    session_id: SESSION_ID,
    agent_id: CHART_AGENT,
    parent_id: handoffNode.id,
    tool: 'fetch_patient_chart',
    args: { patient_id: 'pt-4821', sections: ['vitals', 'labs', 'medications'] },
    result: {
      vitals: { hr: 102, bp: '148/92', spo2: 97 },
      labs: { troponin: 0.04, bnp: 320 },
      medications: ['aspirin', 'metoprolol'],
    },
    latency_ms: 230,
    tags: ['ehr', 'chart_lookup'],
    custom_attributes: {
      pii_accessed: true,
      patient_id: 'pt-4821',
    },
    custom_headers: {
      'x-monitor-kind': 'tool_call',
    },
  });

  const { nodes: [chartNode] } = await inv.trace.submitEvents(chartEvent);
  console.log('Chart lookup submitted:', chartNode.id);

  // ── Step 4: Safety constraint checks ──
  // The safety nurse runs two checks before the case can proceed.
  // A monitor watching constraint_check events with passed=false
  // will fire a signal for the second check.

  const allergyCheck = buildConstraintCheckEvent({
    session_id: SESSION_ID,
    agent_id: SAFETY_AGENT,
    parent_id: chartNode.id,
    constraint: 'no_contraindicated_medications',
    passed: true,
    details: { checked: ['aspirin', 'metoprolol'], conflicts: [] },
    custom_attributes: { check_category: 'medication_safety' },
  });

  const dosageCheck = buildConstraintCheckEvent({
    session_id: SESSION_ID,
    agent_id: SAFETY_AGENT,
    parent_id: chartNode.id,
    constraint: 'dosage_within_range',
    passed: false,
    details: {
      medication: 'metoprolol',
      current_dose: '200mg',
      max_safe_dose: '100mg',
      recommendation: 'Reduce dose or obtain cardiology consult',
    },
    tags: ['safety', 'dosage_alert'],
    custom_attributes: {
      severity: 'critical',
      requires_human_review: true,
    },
    custom_headers: {
      'x-monitor-kind': 'safety_check',
    },
  });

  const { nodes: safetyNodes } = await inv.trace.submitEvents([allergyCheck, dosageCheck]);
  console.log('Safety checks submitted:', safetyNodes.map((n) => n.id));

  // ── Summary ──
  console.log('\nSession:', SESSION_ID);
  console.log('Total trace nodes:', 5);
  console.log('\nMonitor targeting examples:');
  console.log('  - "trace.custom_attributes.risk_tier == \'high\'"  → triage node');
  console.log('  - "trace.custom_attributes.pii_accessed == true"  → chart lookup');
  console.log('  - "trace.action_type == \'constraint_check\' && trace.output.passed == false"  → dosage alert');
}

run().catch(console.error);
