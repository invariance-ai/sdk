import type { ActionTemplate } from './types.js';

export interface ActionDefinition<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> {
  template: ActionTemplate;
  _types?: {
    input: TInput;
    output: TOutput;
  };
}

export type ActionMap = Record<string, ActionDefinition<Record<string, unknown>, Record<string, unknown> | undefined>>;

export type InputOf<TDef> = TDef extends ActionDefinition<infer TInput, any> ? TInput : never;
export type OutputOf<TDef> = TDef extends ActionDefinition<any, infer TOutput> ? TOutput : never;

export function action<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
>(template: ActionTemplate): ActionDefinition<TInput, TOutput> {
  return { template };
}
