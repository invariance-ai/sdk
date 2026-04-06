/**
 * Customer support agent — tool calls with monitor callbacks.
 * Shows session recording, wrap() for auto-capture, and monitor triggers.
 *
 * Run: npx tsx examples/customer-support.ts
 */
import { Invariance } from '@invariance/sdk';

const { privateKey } = Invariance.generateKeypair();

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  privateKey,
  // Fire when a backend monitor triggers on this agent's actions
  onMonitorTrigger: (event) => {
    console.warn(`[ALERT] Monitor "${event.monitor_name}" fired: severity=${event.severity}`);
  },
  monitorPollIntervalMs: 10_000,
});

const session = inv.session({ agent: 'support-agent', name: 'ticket-4821' });

// 1. Look up customer
await session.record({
  action: 'lookup_customer',
  input: { email: 'alice@example.com' },
  output: { customerId: 'cust_123', plan: 'pro' },
});

// 2. Check order — wrap() captures output or error automatically
const { result: order } = await session.wrap(
  { action: 'check_order', input: { orderId: 'ord_789' } },
  async () => ({ status: 'shipped', eta: '2026-03-21' }),
);

// 3. Send response
await session.record({
  action: 'send_response',
  input: { message: `Your order is ${order.status}, ETA ${order.eta}.` },
  output: { delivered: true },
});

session.end();
await inv.shutdown();

console.log(`Session closed: ${session.info().receiptCount} receipts recorded.`);
