import type { DeployAgreementInput } from "./deploy.js";
import type { AgreementArtifact } from "./types.js";

export type RailId = "evm-bnb" | "simulated-readonly";

export type PoolSource = "mock" | "local" | "prod";

export interface RailSessionPool {
  id: string;
  settlement?: {
    contractAddress?: string;
  };
  timeline?: Array<unknown>;
  [key: string]: unknown;
}

export interface RailLiveTimelineEvent {
  cursor: number;
  poolId: string;
  poolName: string;
  event: {
    id: string;
    title: string;
    detail: string;
    at: string;
    status: string;
    [key: string]: unknown;
  };
}

export interface RailInspectStatusInput {
  poolId?: string;
  contractAddress?: string;
  source?: PoolSource;
  railId?: RailId;
}

export interface RailInspectStatusResult {
  source: string;
  generatedAt: string;
  selectedPoolId: string;
  pool: RailSessionPool;
}

export interface RailInspectTimelineInput {
  poolId?: string;
  contractAddress?: string;
  source?: PoolSource;
  sinceCursor?: number;
  railId?: RailId;
}

export interface RailInspectTimelineResult {
  source: string;
  generatedAt: string;
  cursor: number;
  events: RailLiveTimelineEvent[];
}

export interface RailSignerActionInput {
  rpcUrl: string;
  contractAddress: string;
  signerPrivateKey: string;
  railId?: RailId;
}

export interface RailTxResult {
  contractAddress: string;
  signer: string;
  txHash: string;
}

export interface RailAdapter {
  railId: RailId;
  createAgreement(input: DeployAgreementInput): Promise<AgreementArtifact>;
  approveSettlement(input: RailSignerActionInput): Promise<RailTxResult>;
  release(input: RailSignerActionInput): Promise<RailTxResult>;
  claimAfterTimeout(input: RailSignerActionInput): Promise<RailTxResult>;
  inspectStatus(
    input: RailInspectStatusInput,
  ): Promise<RailInspectStatusResult>;
  inspectTimeline(
    input: RailInspectTimelineInput,
  ): Promise<RailInspectTimelineResult>;
}
