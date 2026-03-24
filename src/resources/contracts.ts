import type { HttpClient } from '../http.js';
import { sortedStringify, sha256, ed25519Sign } from '../crypto.js';
import type { Contract, ContractProposeOpts, ContractDeliverOpts, SettlementProof } from '../types/contract.js';

export class ContractsResource {
  constructor(private http: HttpClient) {}

  async propose(opts: ContractProposeOpts): Promise<{ id: string; sessionId: string; status: string }> {
    const termsHash = await sha256(sortedStringify(opts.terms));
    const signature = await ed25519Sign(termsHash, opts.privateKey);
    return this.http.post('/v1/contracts', {
      providerId: opts.providerId,
      terms: opts.terms,
      termsHash,
      signature,
      requestorIdentity: opts.requestorIdentity,
      providerIdentity: opts.providerIdentity,
    });
  }

  async accept(contractId: string, signature: string): Promise<{ id: string; status: string }> {
    return this.http.post(`/v1/contracts/${contractId}/accept`, { signature });
  }

  async deliver(contractId: string, opts: ContractDeliverOpts): Promise<{ id: string; status: string }> {
    const outputHash = await sha256(sortedStringify(opts.outputData));
    const signature = await ed25519Sign(outputHash, opts.privateKey);
    return this.http.post(`/v1/contracts/${contractId}/deliver`, {
      outputData: opts.outputData,
      outputHash,
      signature,
    });
  }

  async acceptDelivery(contractId: string, deliveryId: string, signature: string): Promise<{ id: string; status: string }> {
    return this.http.post(`/v1/contracts/${contractId}/accept-delivery`, { deliveryId, signature });
  }

  async settle(contractId: string): Promise<SettlementProof> {
    return this.http.post<SettlementProof>(`/v1/contracts/${contractId}/settle`);
  }

  async dispute(contractId: string, reason?: string): Promise<{ id: string; status: string; reason: string }> {
    return this.http.post(`/v1/contracts/${contractId}/dispute`, { reason });
  }

  async get(id: string): Promise<Contract> {
    return this.http.get<Contract>(`/v1/contracts/${id}`);
  }

  async list(): Promise<Contract[]> {
    return this.http.get<Contract[]>('/v1/contracts');
  }
}
