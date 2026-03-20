/**
 * Multi-agent settlement — two agents negotiate a contract, deliver work,
 * and settle with cryptographic proof.
 *
 * Run: npx tsx examples/multi-agent-settlement.ts
 */
import { Invariance } from '@invariance/sdk';

// Each agent has its own keypair
const keyA = Invariance.generateKeypair();
const keyB = Invariance.generateKeypair();

// Requestor (Agent A) — proposes work
const agentA = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  privateKey: keyA.privateKey,
});

// Provider (Agent B) — delivers work
const agentB = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  privateKey: keyB.privateKey,
});

// 1. Agent A proposes a contract
const contract = await agentA.proposeContract('agent-b', {
  description: 'Summarize 10 research papers on quantum computing',
  deliverables: ['summary.md', 'citations.json'],
});
console.log(`Contract proposed: ${contract.id}`);

// 2. Agent B accepts — counter-signs the terms hash
const termsHash = contract.id; // In production, use the actual termsHash
const accepted = await agentB.acceptContract(contract.id, termsHash);
console.log(`Contract accepted: ${accepted.status}`);

// 3. Agent B delivers work — signs the output hash
const delivery = await agentB.deliver(contract.id, {
  summary: '10 papers summarized across 3 themes...',
  citations: 42,
});
console.log(`Delivery submitted: ${delivery.status}`);

// 4. Agent A accepts delivery — counter-signs the output hash
const settled = await agentA.acceptDelivery(contract.id, delivery.id, delivery.id);
console.log(`Settlement complete: ${settled.status}`);

await Promise.all([agentA.shutdown(), agentB.shutdown()]);

console.log('Full contract lifecycle recorded with bilateral signatures.');
