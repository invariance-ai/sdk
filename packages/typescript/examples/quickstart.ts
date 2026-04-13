/**
 * Quickstart — minimal session recording example.
 * No cryptographic keys needed — signing is fully opt-in.
 *
 * Run: npx tsx examples/quickstart.ts
 */
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  // Signing is opt-in. To enable Ed25519 signed receipts:
  // const { privateKey } = Invariance.generateKeypair();
  // Pass privateKey here and set instrumentation.provenance: true
});

// Create a session — groups related actions into a hash-chained audit trail
const session = inv.session({ agent: 'my-agent', name: 'quickstart' });

// Record agent actions
await session.record({
  action: 'search',
  input: { query: 'hello world' },
});

await session.record({
  action: 'respond',
  input: { message: 'Found results' },
  output: { count: 5 },
});

// Close the session and shut down
session.end();
await inv.shutdown();

console.log('Done! Check the dashboard for your session.');
