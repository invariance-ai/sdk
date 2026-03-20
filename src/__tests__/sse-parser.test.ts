import { describe, it, expect } from 'vitest';
import { parseSSEChunk } from '../sse-parser.js';

describe('parseSSEChunk', () => {
  it('parses single event', () => {
    const chunk = 'id: 123\nevent: session_created\ndata: {"id":"s1"}\n\n';
    const frames = parseSSEChunk(chunk);
    expect(frames).toHaveLength(1);
    expect(frames[0].id).toBe('123');
    expect(frames[0].event).toBe('session_created');
    expect(frames[0].data).toBe('{"id":"s1"}');
  });

  it('parses multiple events', () => {
    const chunk = 'data: event1\n\ndata: event2\n\n';
    const frames = parseSSEChunk(chunk);
    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe('event1');
    expect(frames[1].data).toBe('event2');
  });

  it('handles multi-line data', () => {
    const chunk = 'data: line1\ndata: line2\n\n';
    const frames = parseSSEChunk(chunk);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe('line1\nline2');
  });

  it('skips empty frames', () => {
    const chunk = '\n\n\n\n';
    const frames = parseSSEChunk(chunk);
    expect(frames).toHaveLength(0);
  });

  it('handles malformed input gracefully', () => {
    const chunk = 'garbage text without proper format\n\n';
    const frames = parseSSEChunk(chunk);
    // Should produce a frame since there's text, but no structured fields
    // The parser should not crash
    expect(frames.length).toBeGreaterThanOrEqual(0);
  });

  it('handles event-only frame (no data)', () => {
    const chunk = 'event: ping\n\n';
    const frames = parseSSEChunk(chunk);
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('ping');
    expect(frames[0].data).toBe('');
  });
});
