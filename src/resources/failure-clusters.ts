import type { HttpClient } from '../http.js';
import type {
  FailureCluster, CreateFailureClusterBody, UpdateFailureClusterBody,
  FailureClusterListOpts, FailureClusterMember, AddClusterMemberBody,
} from '../types/failure-cluster.js';

export class FailureClustersResource {
  constructor(private http: HttpClient) {}

  async list(opts?: FailureClusterListOpts): Promise<FailureCluster[]> {
    return this.http.get<FailureCluster[]>('/v1/evals/clusters', {
      params: opts as Record<string, string | undefined>,
    });
  }

  async get(id: string): Promise<FailureCluster> {
    return this.http.get<FailureCluster>(`/v1/evals/clusters/${id}`);
  }

  async create(body: CreateFailureClusterBody): Promise<FailureCluster> {
    return this.http.post<FailureCluster>('/v1/evals/clusters', body);
  }

  async update(id: string, body: UpdateFailureClusterBody): Promise<FailureCluster> {
    return this.http.patch<FailureCluster>(`/v1/evals/clusters/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/evals/clusters/${id}`);
  }

  async addMember(clusterId: string, body: AddClusterMemberBody): Promise<FailureClusterMember> {
    return this.http.post<FailureClusterMember>(`/v1/evals/clusters/${clusterId}/members`, body);
  }
}
