import { describe, it, expect, vi } from 'vitest';
import { LiveStatusClient } from '../live-status.js';

describe('LiveStatusClient', () => {
  it('initializes with config', () => {
    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
    });
    expect(client.connected).toBe(false);
  });

  it('disconnect cleans up', () => {
    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
    });
    client.connect();
    client.disconnect();
    expect(client.connected).toBe(false);
  });

  it('does not double-connect', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no server'));
    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
      onError: () => {},
    });
    client.connect();
    client.connect(); // second call should be no-op
    // Only one fetch should have been initiated
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    client.disconnect();
    fetchSpy.mockRestore();
  });

  it('filters by eventTypes', () => {
    // This is tested through the config — just verify it accepts the option
    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
      eventTypes: ['session_created', 'anomaly_detected'],
    });
    expect(client.connected).toBe(false);
    client.disconnect();
  });

  it('onError callback is optional', () => {
    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
    });
    // No error should be thrown when onError is not provided
    client.disconnect();
  });

  it('routes malformed event payloads to onError', async () => {
    const onError = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: trace_node_created\ndata: {not-json}\n\n'));
          controller.close();
        },
      }),
    } as Response);

    const client = new LiveStatusClient({
      apiUrl: 'http://localhost:3001',
      apiKey: 'test-key',
      onEvent: () => {},
      onError,
    });

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onError).toHaveBeenCalled();
    client.disconnect();
    fetchSpy.mockRestore();
  });
});
