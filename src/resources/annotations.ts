import type { HttpClient } from '../http.js';
import type {
  AnnotationQueueItem,
  CreateAnnotationBody,
  UpdateAnnotationBody,
  HumanScore,
  SubmitAnnotationScoreBody,
  HumanScoreStats,
  EnrichedAnnotation,
  AnnotationQueueStats,
} from '../types/annotation.js';

export class AnnotationsResource {
  constructor(private http: HttpClient) {}

  async list(opts?: {
    status?: string;
    target_type?: string;
    agent_id?: string;
    scorer_id?: string;
    assigned_to?: string;
    run_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<AnnotationQueueItem[]> {
    return this.http.get<AnnotationQueueItem[]>('/v1/training/annotations', {
      params: opts as Record<string, string | number | undefined>,
    });
  }

  async get(id: string): Promise<EnrichedAnnotation> {
    return this.http.get<EnrichedAnnotation>(`/v1/training/annotations/${id}`);
  }

  async create(body: CreateAnnotationBody | CreateAnnotationBody[]): Promise<AnnotationQueueItem | AnnotationQueueItem[]> {
    return this.http.post<AnnotationQueueItem | AnnotationQueueItem[]>('/v1/training/annotations', body);
  }

  async update(id: string, body: UpdateAnnotationBody): Promise<AnnotationQueueItem> {
    return this.http.patch<AnnotationQueueItem>(`/v1/training/annotations/${id}`, body);
  }

  async submitScore(id: string, body: SubmitAnnotationScoreBody): Promise<HumanScore> {
    return this.http.post<HumanScore>(`/v1/training/annotations/${id}/score`, body);
  }

  async claim(opts?: { scorer_id?: string; run_id?: string }): Promise<AnnotationQueueItem> {
    return this.http.post<AnnotationQueueItem>('/v1/training/annotations/claim', opts ?? {});
  }

  async release(id: string): Promise<AnnotationQueueItem> {
    return this.http.post<AnnotationQueueItem>(`/v1/training/annotations/${id}/release`, {});
  }

  async queueStats(): Promise<AnnotationQueueStats> {
    return this.http.get<AnnotationQueueStats>('/v1/training/annotations/stats');
  }

  async listHumanScores(opts?: { target_type?: string; agent_id?: string; scorer_id?: string; limit?: number; offset?: number }): Promise<HumanScore[]> {
    return this.http.get<HumanScore[]>('/v1/training/human-scores', {
      params: opts as Record<string, string | number | undefined>,
    });
  }

  async stats(): Promise<HumanScoreStats> {
    return this.http.get<HumanScoreStats>('/v1/training/human-scores/stats');
  }
}
