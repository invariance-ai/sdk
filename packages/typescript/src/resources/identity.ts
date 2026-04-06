import type { HttpClient } from '../http.js';
import type { DeveloperIdentity, OrgIdentity, AgentIdentity, SignupOpts, RegisterAgentOpts } from '../types/identity.js';

export class IdentityResource {
  constructor(private http: HttpClient) {}

  async signup(opts: SignupOpts): Promise<DeveloperIdentity> {
    return this.http.post<DeveloperIdentity>('/v1/identity/signup', opts);
  }

  async createOrg(opts: { name: string }): Promise<OrgIdentity> {
    return this.http.post<OrgIdentity>('/v1/identity/orgs', opts);
  }

  async registerAgent(owner: string, opts: RegisterAgentOpts): Promise<AgentIdentity> {
    return this.http.post<AgentIdentity>(`/v1/identity/agents/${owner}`, opts);
  }

  async lookup(owner: string, name: string): Promise<AgentIdentity> {
    return this.http.get<AgentIdentity>(`/v1/identity/agents/${owner}/${name}`);
  }
}
