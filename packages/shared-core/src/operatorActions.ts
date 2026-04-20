import type { OperatorActionRequest, OperatorActionResponse } from "./types.js";
import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";

const ESCROW_ABI = [
  "function claimAfterTimeout()",
  "function released() view returns (bool)",
] as const;

interface OnChainOperatorConfig {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
}

function buildResponse(
  request: OperatorActionRequest,
  status: OperatorActionResponse["status"],
  detail: string,
  summary?: string,
  onChainTxHash?: string,
): OperatorActionResponse {
  return {
    requestId: `op-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    poolId: request.poolId,
    action: request.action,
    status,
    detail,
    createdAt: new Date().toISOString(),
    summary,
    onChainTxHash,
  };
}

async function tryTimeoutOverride(
  config: OnChainOperatorConfig,
): Promise<{ txHash?: string; error?: string }> {
  try {
    const provider = new JsonRpcProvider(config.rpcUrl);
    const wallet = new Wallet(config.privateKey, provider);
    const signer = new NonceManager(wallet);
    const contract = new Contract(config.contractAddress, ESCROW_ABI, signer);
    const tx = await contract.claimAfterTimeout();
    await tx.wait();
    return { txHash: tx.hash };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "unknown on-chain error",
    };
  }
}

export function executeOperatorAction(
  request: OperatorActionRequest,
): OperatorActionResponse {
  if (!request.poolId || !request.action) {
    return buildResponse(
      request,
      "rejected",
      "Operator action requires poolId and action.",
    );
  }

  if (request.action === "retry-step") {
    return buildResponse(
      request,
      "accepted",
      `Queued retry for step ${request.stepId || "latest"}.`,
    );
  }

  if (request.action === "force-reveal-public-summary") {
    return buildResponse(
      request,
      "accepted",
      "Queued public summary reveal with policy-safe filtering.",
      "Public summary reveal queued.",
    );
  }

  if (request.action === "escalate-dispute") {
    return buildResponse(
      request,
      "accepted",
      `Dispute escalation marker created.${request.reason ? ` Reason: ${request.reason}` : ""}`,
    );
  }

  return buildResponse(request, "rejected", "Unsupported operator action.");
}

export async function executeOperatorActionWithOnChain(
  request: OperatorActionRequest,
  onChain?: {
    rpcUrl?: string;
    privateKey?: string;
  },
): Promise<OperatorActionResponse> {
  const response = executeOperatorAction(request);

  const allowOnChainOverride =
    response.status === "accepted" &&
    (request.action === "retry-step" || request.action === "escalate-dispute");

  if (!allowOnChainOverride) {
    return response;
  }

  if (!request.contractAddress || !onChain?.rpcUrl || !onChain.privateKey) {
    return response;
  }

  const result = await tryTimeoutOverride({
    rpcUrl: onChain.rpcUrl,
    privateKey: onChain.privateKey,
    contractAddress: request.contractAddress,
  });

  if (result.txHash) {
    return {
      ...response,
      detail: `${response.detail} On-chain timeout override executed.`,
      onChainTxHash: result.txHash,
    };
  }

  if (result.error) {
    return {
      ...response,
      detail: `${response.detail} On-chain override not applied (${result.error}).`,
    };
  }

  return response;
}
