export interface ToolStrategy {
  allowed_tools?: string[];
  preferred_order?: string[];
  selection_hints?: Record<string, string>;
  retry_rules?: Record<string, unknown>;
  handoff_rules?: Record<string, unknown>;
  termination_conditions?: Array<{ type: string; value: unknown }>;
}

export interface StopCondition {
  type: string;
  value: unknown;
}

export interface Prompt {
  id: string;
  name: string;
  description: string | null;
  scope: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  latest_version?: number | null;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  system_prompt: string;
  developer_prompt: string;
  tool_strategy: ToolStrategy;
  stop_conditions: StopCondition[];
  variables: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreatePromptBody {
  name: string;
  description?: string;
  scope?: string;
  version?: boolean;
}

export interface UpdatePromptBody {
  name?: string;
  description?: string;
  scope?: string;
}

export interface CreatePromptVersionBody {
  system_prompt: string;
  developer_prompt?: string;
  tool_strategy?: ToolStrategy;
  stop_conditions?: StopCondition[];
  variables?: string[];
  metadata?: Record<string, unknown>;
}

export interface PromptDiffResult {
  from: PromptVersion;
  to: PromptVersion;
  changes: {
    system_prompt: { from: string; to: string };
    developer_prompt: { from: string; to: string };
    tool_strategy: { from: ToolStrategy; to: ToolStrategy };
    stop_conditions: { from: StopCondition[]; to: StopCondition[] };
    variables: { added: string[]; removed: string[] };
  };
}
