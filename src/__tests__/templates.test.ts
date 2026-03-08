import { describe, it, expect } from 'vitest';
import { action } from '../templates.js';
import type { InputOf, OutputOf, ActionDefinition } from '../templates.js';

describe('action()', () => {
  it('creates an ActionDefinition with template metadata', () => {
    const def = action<{ amount: number }, { txId: string }>({
      label: 'Transfer',
      category: 'write',
      highlights: ['amount', 'txId'],
    });

    expect(def.template.label).toBe('Transfer');
    expect(def.template.category).toBe('write');
    expect(def.template.highlights).toEqual(['amount', 'txId']);
  });

  it('works without output type parameter', () => {
    const def = action<{ query: string }>({
      label: 'Search',
    });

    expect(def.template.label).toBe('Search');
  });

  it('preserves all template fields', () => {
    const def = action({
      label: 'Full',
      category: 'read',
      icon: 'search',
      description: 'A full action',
      highlights: ['a'],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    });

    expect(def.template).toEqual({
      label: 'Full',
      category: 'read',
      icon: 'search',
      description: 'A full action',
      highlights: ['a'],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    });
  });
});

describe('InputOf / OutputOf type helpers', () => {
  it('correctly extract input and output types (compile-time check)', () => {
    const def = action<{ x: number }, { y: string }>({ label: 'Test' });

    // These are compile-time checks — if they compile, the types work
    const _input: InputOf<typeof def> = { x: 1 };
    const _output: OutputOf<typeof def> = { y: 'hello' };

    expect(_input.x).toBe(1);
    expect(_output.y).toBe('hello');
  });
});
