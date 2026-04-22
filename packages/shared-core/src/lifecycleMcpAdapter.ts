import { type DeployAgreementInput } from "./deploy.js";
import { resolveRailAdapter } from "./railResolver.js";
import type {
  RailId,
  RailInspectStatusInput,
  RailInspectStatusResult,
  RailInspectTimelineInput,
  RailInspectTimelineResult,
  RailSubmitDeliveryProofInput,
} from "./railAdapter.js";
import type { AgreementArtifact } from "./types.js";
export type InspectStatusViaMcpInput = RailInspectStatusInput;
export type InspectStatusViaMcpResult = RailInspectStatusResult;
export type InspectTimelineViaMcpInput = RailInspectTimelineInput;
export type InspectTimelineViaMcpResult = RailInspectTimelineResult;

export interface ApproveSettlementViaMcpInput {
  rpcUrl: string;
  contractAddress: string;
  signerPrivateKey: string;
  railId?: RailId;
}

export interface ApproveSettlementViaMcpResult {
  contractAddress: string;
  signer: string;
  txHash: string;
}

export interface SubmitDeliveryProofViaMcpInput
  extends RailSubmitDeliveryProofInput {
  railId?: RailId;
}

export interface SubmitDeliveryProofViaMcpResult {
  contractAddress: string;
  signer: string;
  txHash: string;
}

export interface ReleaseViaMcpInput {
  rpcUrl: string;
  contractAddress: string;
  signerPrivateKey: string;
  railId?: RailId;
}

export interface ReleaseViaMcpResult {
  contractAddress: string;
  signer: string;
  txHash: string;
}

export interface AutoClaimTimeoutViaMcpInput {
  rpcUrl: string;
  contractAddress: string;
  signerPrivateKey: string;
  railId?: RailId;
}

export interface AutoClaimTimeoutViaMcpResult {
  contractAddress: string;
  signer: string;
  txHash: string;
}

export async function createAgreementViaMcp(
  input: DeployAgreementInput & { railId?: RailId },
): Promise<AgreementArtifact> {
  const rail = resolveRailAdapter({
    railId: input.railId,
    network: input.network,
  });
  return rail.createAgreement(input);
}

export async function inspectStatusViaMcp(
  input: InspectStatusViaMcpInput,
): Promise<InspectStatusViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.inspectStatus(input);
}

export async function inspectTimelineViaMcp(
  input: InspectTimelineViaMcpInput,
): Promise<InspectTimelineViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.inspectTimeline(input);
}

export async function approveSettlementViaMcp(
  input: ApproveSettlementViaMcpInput,
): Promise<ApproveSettlementViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.approveSettlement(input);
}

export async function submitDeliveryProofViaMcp(
  input: SubmitDeliveryProofViaMcpInput,
): Promise<SubmitDeliveryProofViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.submitDeliveryProof(input);
}

export async function releaseViaMcp(
  input: ReleaseViaMcpInput,
): Promise<ReleaseViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.release(input);
}

export async function autoClaimTimeoutViaMcp(
  input: AutoClaimTimeoutViaMcpInput,
): Promise<AutoClaimTimeoutViaMcpResult> {
  const rail = resolveRailAdapter({ railId: input.railId });
  return rail.claimAfterTimeout(input);
}
