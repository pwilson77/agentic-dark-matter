import type {
  AgreementArtifact,
  ApproveSettlementViaMcpResult,
  AutoClaimTimeoutViaMcpResult,
  DeployAgreementInput,
  InspectStatusViaMcpResult,
  InspectTimelineViaMcpResult,
  RailId,
  ReleaseViaMcpResult,
  SubmitDeliveryProofViaMcpResult,
} from "@adm/shared-core";

export interface ApproveSettlementInput {
  contractAddress: string;
  signerPrivateKey: string;
  rpcUrl?: string;
  railId?: RailId;
}

export interface ReleaseSettlementInput {
  contractAddress: string;
  signerPrivateKey: string;
  rpcUrl?: string;
  railId?: RailId;
}

export interface SubmitDeliveryProofInput {
  contractAddress: string;
  signerPrivateKey: string;
  proofHash: string;
  rpcUrl?: string;
  railId?: RailId;
}

export interface AutoClaimTimeoutInput {
  contractAddress: string;
  signerPrivateKey: string;
  rpcUrl?: string;
  railId?: RailId;
}

export interface CreateAgreementInput extends DeployAgreementInput {
  railId?: RailId;
}

export interface InspectStatusInput {
  poolId?: string;
  contractAddress?: string;
  source?: "mock" | "local" | "prod";
  railId?: RailId;
}

export interface InspectTimelineInput {
  poolId?: string;
  contractAddress?: string;
  source?: "mock" | "local" | "prod";
  sinceCursor?: number;
  railId?: RailId;
}

export interface RunStandardLifecycleInput {
  createInput: CreateAgreementInput;
  agentAPrivateKey: string;
  agentBPrivateKey: string;
  releaseSignerPrivateKey?: string;
  /** 0x-prefixed 32-byte hex delivery proof hash. Required when the escrow contract enforces proof-gated release. */
  deliveryProofHash?: string;
}

export interface RunStandardLifecycleResult {
  agreement: AgreementArtifact;
  approveA: ApproveSettlementViaMcpResult;
  submitProof: SubmitDeliveryProofViaMcpResult;
  approveB: ApproveSettlementViaMcpResult;
  release: ReleaseViaMcpResult;
}

export type {
  AgreementArtifact,
  ApproveSettlementViaMcpResult,
  AutoClaimTimeoutViaMcpResult,
  InspectStatusViaMcpResult,
  InspectTimelineViaMcpResult,
  ReleaseViaMcpResult,
  SubmitDeliveryProofViaMcpResult,
};
