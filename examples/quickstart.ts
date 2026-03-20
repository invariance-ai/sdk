/**
 * Quickstart — minimal session recording example.
 * Auto-generates a keypair so you don't need to manage keys.
 *
 * Run: npx tsx examples/quickstart.ts
 */
import { Invariance } from '@invariance/sdk';

// Generate a fresh keypair (no need to manage keys for dev/testing)
const { privateKey } = Invariance.generateKeypair();

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  privateKey,
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
