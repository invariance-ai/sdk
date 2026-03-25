import type { HttpClient } from '../http.js';
import type {
  Dataset,
  DatasetRow,
  DatasetVersion,
  CreateDatasetBody,
  UpdateDatasetBody,
  CreateDatasetRowBody,
  UpdateDatasetRowBody,
  DatasetFromTracesBody,
  ImportDatasetRowsFromTracesBody,
} from '../types/dataset.js';

export class DatasetsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: { agent_id?: string }): Promise<Dataset[]> {
    return this.http.get<Dataset[]>('/v1/datasets', { params: opts as Record<string, string | undefined> });
  }

  async get(id: string): Promise<Dataset> {
    return this.http.get<Dataset>(`/v1/datasets/${id}`);
  }

  async create(body: CreateDatasetBody): Promise<Dataset> {
    return this.http.post<Dataset>('/v1/datasets', body);
  }

  async update(id: string, body: UpdateDatasetBody): Promise<Dataset> {
    return this.http.patch<Dataset>(`/v1/datasets/${id}`, body);
  }

  async delete(id: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/datasets/${id}`);
  }

  async listRows(id: string, opts?: { limit?: number; offset?: number; tags?: string[] }): Promise<DatasetRow[]> {
    return this.http.get<DatasetRow[]>(`/v1/datasets/${id}/rows`, {
      params: {
        limit: opts?.limit,
        offset: opts?.offset,
        tags: opts?.tags?.join(','),
      },
    });
  }

  async addRows(id: string, body: CreateDatasetRowBody | CreateDatasetRowBody[]): Promise<DatasetRow[]> {
    return this.http.post<DatasetRow[]>(`/v1/datasets/${id}/rows`, body);
  }

  async updateRow(id: string, rowId: string, body: UpdateDatasetRowBody): Promise<DatasetRow> {
    return this.http.patch<DatasetRow>(`/v1/datasets/${id}/rows/${rowId}`, body);
  }

  async deleteRow(id: string, rowId: string): Promise<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/v1/datasets/${id}/rows/${rowId}`);
  }

  async publish(id: string, body?: { notes?: string }): Promise<DatasetVersion> {
    return this.http.post<DatasetVersion>(`/v1/datasets/${id}/publish`, body ?? {});
  }

  async listVersions(id: string): Promise<DatasetVersion[]> {
    return this.http.get<DatasetVersion[]>(`/v1/datasets/${id}/versions`);
  }

  async getVersion(id: string, version: number): Promise<DatasetVersion> {
    return this.http.get<DatasetVersion>(`/v1/datasets/${id}/versions/${version}`);
  }

  async createFromTraces(body: DatasetFromTracesBody): Promise<Dataset> {
    return this.http.post<Dataset>('/v1/datasets/from-traces', body);
  }

  async importTraces(id: string, body: ImportDatasetRowsFromTracesBody): Promise<DatasetRow[]> {
    return this.http.post<DatasetRow[]>(`/v1/datasets/${id}/import-traces`, body);
  }
}
