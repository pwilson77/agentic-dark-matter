import {
  approveSettlementViaMcp,
  autoClaimTimeoutViaMcp,
  createAgreementViaMcp,
  inspectStatusViaMcp,
  inspectTimelineViaMcp,
  releaseViaMcp,
  submitDeliveryProofViaMcp,
} from "@adm/shared-core";
import {
  type AgentSdkConfig,
  type NormalizedAgentSdkConfig,
  normalizeSdkConfig,
} from "./config.js";
import { AgentSdkError, toSdkError } from "./errors.js";
import type {
  ApproveSettlementInput,
  ApproveSettlementViaMcpResult,
  AutoClaimTimeoutInput,
  AutoClaimTimeoutViaMcpResult,
  CreateAgreementInput,
  InspectStatusInput,
  InspectStatusViaMcpResult,
  InspectTimelineInput,
  InspectTimelineViaMcpResult,
  ReleaseSettlementInput,
  ReleaseViaMcpResult,
  RunStandardLifecycleInput,
  RunStandardLifecycleResult,
  SubmitDeliveryProofInput,
  SubmitDeliveryProofViaMcpResult,
} from "./types.js";

function assertSignerPrivateKey(value: string, operation: string): void {
  if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new AgentSdkError({
      code: "INVALID_INPUT",
      operation,
      message: "signerPrivateKey must be a 32-byte hex string",
    });
  }
}

function assertContractAddress(value: string, operation: string): void {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new AgentSdkError({
      code: "INVALID_INPUT",
      operation,
      message: "contractAddress must be a 20-byte hex address",
    });
  }
}

export class AgentSdkClient {
  private readonly config: NormalizedAgentSdkConfig;

  constructor(config: AgentSdkConfig) {
    this.config = normalizeSdkConfig(config);
  }

  async createAgreement(input: CreateAgreementInput) {
    try {
      return await createAgreementViaMcp({
        ...input,
        railId: input.railId || this.config.railId,
      });
    } catch (error) {
      throw toSdkError({ operation: "createAgreement", error });
    }
  }

  async approveSettlement(
    input: ApproveSettlementInput,
  ): Promise<ApproveSettlementViaMcpResult> {
    assertContractAddress(input.contractAddress, "approveSettlement");
    assertSignerPrivateKey(input.signerPrivateKey, "approveSettlement");

    try {
      return await approveSettlementViaMcp({
        rpcUrl: input.rpcUrl || this.config.rpcUrl,
        contractAddress: input.contractAddress,
        signerPrivateKey: input.signerPrivateKey,
        railId: input.railId || this.config.railId,
      });
    } catch (error) {
      throw toSdkError({ operation: "approveSettlement", error });
    }
  }

  async submitDeliveryProof(
    input: SubmitDeliveryProofInput,
  ): Promise<SubmitDeliveryProofViaMcpResult> {
    assertContractAddress(input.contractAddress, "submitDeliveryProof");
    assertSignerPrivateKey(input.signerPrivateKey, "submitDeliveryProof");

    if (!input.proofHash || !/^0x[a-fA-F0-9]{64}$/.test(input.proofHash)) {
      throw new AgentSdkError({
        code: "INVALID_INPUT",
        operation: "submitDeliveryProof",
        message:
          "proofHash must be a 0x-prefixed 32-byte hex string (64 hex chars)",
      });
    }

    try {
      return await submitDeliveryProofViaMcp({
        rpcUrl: input.rpcUrl || this.config.rpcUrl,
        contractAddress: input.contractAddress,
        signerPrivateKey: input.signerPrivateKey,
        proofHash: input.proofHash,
        railId: input.railId || this.config.railId,
      });
    } catch (error) {
      throw toSdkError({ operation: "submitDeliveryProof", error });
    }
  }

  async release(input: ReleaseSettlementInput): Promise<ReleaseViaMcpResult> {
    assertContractAddress(input.contractAddress, "release");
    assertSignerPrivateKey(input.signerPrivateKey, "release");

    try {
      return await releaseViaMcp({
        rpcUrl: input.rpcUrl || this.config.rpcUrl,
        contractAddress: input.contractAddress,
        signerPrivateKey: input.signerPrivateKey,
        railId: input.railId || this.config.railId,
      });
    } catch (error) {
      throw toSdkError({ operation: "release", error });
    }
  }

  async autoClaimTimeout(
    input: AutoClaimTimeoutInput,
  ): Promise<AutoClaimTimeoutViaMcpResult> {
    assertContractAddress(input.contractAddress, "autoClaimTimeout");
    assertSignerPrivateKey(input.signerPrivateKey, "autoClaimTimeout");

    try {
      return await autoClaimTimeoutViaMcp({
        rpcUrl: input.rpcUrl || this.config.rpcUrl,
        contractAddress: input.contractAddress,
        signerPrivateKey: input.signerPrivateKey,
        railId: input.railId || this.config.railId,
      });
    } catch (error) {
      throw toSdkError({ operation: "autoClaimTimeout", error });
    }
  }

  async inspectStatus(
    input: InspectStatusInput = {},
  ): Promise<InspectStatusViaMcpResult> {
    const maxAttempts = Math.max(1, this.config.retries.readMaxAttempts);
    const delayMs = Math.max(0, this.config.retries.readDelayMs);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await inspectStatusViaMcp({
          poolId: input.poolId,
          contractAddress: input.contractAddress,
          source: input.source || this.config.source,
          railId: input.railId || this.config.railId,
        });
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw toSdkError({
            operation: "inspectStatus",
            error,
            retriable: true,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new AgentSdkError({
      code: "OPERATION_FAILED",
      operation: "inspectStatus",
      message: "inspectStatus failed after retries",
      retriable: true,
    });
  }

  async inspectTimeline(
    input: InspectTimelineInput = {},
  ): Promise<InspectTimelineViaMcpResult> {
    const maxAttempts = Math.max(1, this.config.retries.readMaxAttempts);
    const delayMs = Math.max(0, this.config.retries.readDelayMs);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await inspectTimelineViaMcp({
          poolId: input.poolId,
          contractAddress: input.contractAddress,
          source: input.source || this.config.source,
          sinceCursor: input.sinceCursor,
          railId: input.railId || this.config.railId,
        });
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw toSdkError({
            operation: "inspectTimeline",
            error,
            retriable: true,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new AgentSdkError({
      code: "OPERATION_FAILED",
      operation: "inspectTimeline",
      message: "inspectTimeline failed after retries",
      retriable: true,
    });
  }

  async runStandardLifecycle(
    input: RunStandardLifecycleInput,
  ): Promise<RunStandardLifecycleResult> {
    assertSignerPrivateKey(input.agentAPrivateKey, "runStandardLifecycle");
    assertSignerPrivateKey(input.agentBPrivateKey, "runStandardLifecycle");

    const agreement = await this.createAgreement(input.createInput);
    const contractAddress = String(agreement.contractAddress || "");
    assertContractAddress(contractAddress, "runStandardLifecycle");

    const rpcUrl = input.createInput.onChain?.rpcUrl || this.config.rpcUrl;
    const railId = input.createInput.railId || this.config.railId;

    const approveA = await this.approveSettlement({
      contractAddress,
      signerPrivateKey: input.agentAPrivateKey,
      rpcUrl,
      railId,
    });

    const proofHash =
      input.deliveryProofHash || `0x${"ab".repeat(32)}`;
    const submitProof = await this.submitDeliveryProof({
      contractAddress,
      signerPrivateKey: input.agentBPrivateKey,
      proofHash,
      rpcUrl,
      railId,
    });

    const approveB = await this.approveSettlement({
      contractAddress,
      signerPrivateKey: input.agentBPrivateKey,
      rpcUrl,
      railId,
    });

    const release = await this.release({
      contractAddress,
      signerPrivateKey: input.releaseSignerPrivateKey || input.agentAPrivateKey,
      rpcUrl,
      railId,
    });

    return {
      agreement,
      approveA,
      submitProof,
      approveB,
      release,
    };
  }
}
