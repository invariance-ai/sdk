export interface DeveloperIdentity {
  handle: string;
  public_key: string;
  private_key: string;
  api_key: string;
}

export interface OrgIdentity {
  name: string;
  public_key: string;
  private_key: string;
  api_key: string;
}

export interface AgentIdentity {
  owner: string;
  name: string;
  public_key: string;
  agent_id: string;
  created_at: string;
}

export interface IdentityRecord {
  id: string;
  name: string;
  owner?: string;
  type?: string;
  public_key?: string;
  session_count?: number;
  created_at: string;
}

export interface SignupOpts {
  email: string;
  name: string;
  handle: string;
}

export interface RegisterAgentOpts {
  name: string;
  public_key: string;
}
