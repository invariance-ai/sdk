import type { HttpClient } from '../http.js';
import type { Receipt, ReceiptQuery } from '../types/receipt.js';

export class ReceiptsResource {
  constructor(private http: HttpClient) {}

  async submit(receipts: Receipt[]): Promise<{ inserted: number }> {
    return this.http.post<{ inserted: number }>('/v1/receipts', { receipts });
  }

  async query(opts?: ReceiptQuery): Promise<Receipt[]> {
    return this.http.get<Receipt[]>('/v1/receipts', {
      params: opts as Record<string, string | number | undefined>,
    });
  }
}
