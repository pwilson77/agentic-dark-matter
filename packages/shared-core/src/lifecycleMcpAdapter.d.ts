import { type DeployAgreementInput } from "./deploy.js";
import type { RailId, RailInspectStatusInput, RailInspectStatusResult, RailInspectTimelineInput, RailInspectTimelineResult } from "./railAdapter.js";
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
export declare function createAgreementViaMcp(input: DeployAgreementInput & {
    railId?: RailId;
}): Promise<AgreementArtifact>;
export declare function inspectStatusViaMcp(input: InspectStatusViaMcpInput): Promise<InspectStatusViaMcpResult>;
export declare function inspectTimelineViaMcp(input: InspectTimelineViaMcpInput): Promise<InspectTimelineViaMcpResult>;
export declare function approveSettlementViaMcp(input: ApproveSettlementViaMcpInput): Promise<ApproveSettlementViaMcpResult>;
export declare function releaseViaMcp(input: ReleaseViaMcpInput): Promise<ReleaseViaMcpResult>;
export declare function autoClaimTimeoutViaMcp(input: AutoClaimTimeoutViaMcpInput): Promise<AutoClaimTimeoutViaMcpResult>;
