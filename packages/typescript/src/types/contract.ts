export interface Contract {
  id: string;
  requestor_id: string;
  provider_id: string;
  session_id: string;
  terms: Record<string, unknown>;
  terms_hash: string;
  requestor_signature: string;
  provider_signature: string | null;
  status: 'proposed' | 'accepted' | 'active' | 'settled' | 'disputed' | 'expired';
  settlement_hash: string | null;
  settlement_proof: Record<string, unknown> | null;
  requestor_identity: string | null;
  provider_identity: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractProposeOpts {
  providerId: string;
  terms: Record<string, unknown>;
  privateKey: string;
  requestorIdentity?: string;
  providerIdentity?: string;
}

export interface ContractDeliverOpts {
  outputData: Record<string, unknown>;
  privateKey: string;
}

export interface DeliveryProof {
  id: string;
  contract_id: string;
  provider_id: string;
  output_hash: string;
  output_data: Record<string, unknown>;
  signature: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestor_signature: string | null;
  created_at: string;
}

export interface SettlementProof {
  contractId: string;
  termsHash: string;
  settlementHash: string;
  sessionId: string;
  sessionValid: boolean;
  deliveryCount: number;
  signatures: {
    requestor: string;
    provider: string;
  };
  deliveries: Array<{ id: string; outputHash: string }>;
  settledAt: string;
}
