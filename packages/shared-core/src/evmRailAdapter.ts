import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import { deployDarkMatterAgreement } from "./deploy.js";
import type {
  RailAdapter,
  RailInspectStatusInput,
  RailInspectStatusResult,
  RailInspectTimelineInput,
  RailInspectTimelineResult,
  RailSignerActionInput,
  RailSubmitDeliveryProofInput,
  RailTxResult,
} from "./railAdapter.js";
import {
  inspectStatusFromSessionApi,
  inspectTimelineFromSessionApi,
} from "./sessionApiHelpers.js";

const ESCROW_ABI = [
  "function agentA() view returns (address)",
  "function agentB() view returns (address)",
  "function approveSettlement()",
  "function submitDeliveryProof(bytes32 proofHash)",
  "function release()",
  "function claimAfterTimeout()",
] as const;

function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid EVM address: ${value}`);
  }
  return normalized;
}

async function assertSignerIsParticipant(
  provider: JsonRpcProvider,
  contractAddress: string,
  signer: Wallet,
): Promise<void> {
  const contract = new Contract(contractAddress, ESCROW_ABI, provider);
  const [agentA, agentB] = await Promise.all([
    contract.agentA() as Promise<string>,
    contract.agentB() as Promise<string>,
  ]);

  const signerAddress = normalizeAddress(signer.address);
  const participants = [normalizeAddress(agentA), normalizeAddress(agentB)];
  if (!participants.includes(signerAddress)) {
    throw new Error("Signer is not a pool participant for lifecycle action.");
  }
}

async function executeSignerAction(
  input: RailSignerActionInput,
  method: "approveSettlement" | "release" | "claimAfterTimeout",
): Promise<RailTxResult> {
  const provider = new JsonRpcProvider(input.rpcUrl);
  const signer = new Wallet(input.signerPrivateKey, provider);
  const contractAddress = normalizeAddress(input.contractAddress);
  await assertSignerIsParticipant(provider, contractAddress, signer);

  const managedSigner = new NonceManager(signer);
  const contract = new Contract(contractAddress, ESCROW_ABI, managedSigner);
  const tx =
    method === "approveSettlement"
      ? await contract.approveSettlement()
      : method === "release"
        ? await contract.release()
        : await contract.claimAfterTimeout();

  await tx.wait();

  return {
    contractAddress,
    signer: signer.address,
    txHash: tx.hash,
  };
}

async function executeSubmitDeliveryProof(
  input: RailSubmitDeliveryProofInput,
): Promise<RailTxResult> {
  const provider = new JsonRpcProvider(input.rpcUrl);
  const signer = new Wallet(input.signerPrivateKey, provider);
  const contractAddress = normalizeAddress(input.contractAddress);
  await assertSignerIsParticipant(provider, contractAddress, signer);

  if (!input.proofHash || !/^0x[a-fA-F0-9]{64}$/.test(input.proofHash)) {
    throw new Error(
      `submitDeliveryProof: proofHash must be a 32-byte hex string, got: ${input.proofHash}`,
    );
  }

  const managedSigner = new NonceManager(signer);
  const contract = new Contract(contractAddress, ESCROW_ABI, managedSigner);
  const tx = await contract.submitDeliveryProof(input.proofHash);
  await tx.wait();

  return {
    contractAddress,
    signer: signer.address,
    txHash: tx.hash,
  };
}

export const evmRailAdapter: RailAdapter = {
  railId: "evm-bnb",
  async createAgreement(input) {
    return deployDarkMatterAgreement(input);
  },
  async approveSettlement(input) {
    return executeSignerAction(input, "approveSettlement");
  },
  async submitDeliveryProof(input) {
    return executeSubmitDeliveryProof(input);
  },
  async release(input) {
    return executeSignerAction(input, "release");
  },
  async claimAfterTimeout(input) {
    return executeSignerAction(input, "claimAfterTimeout");
  },
  async inspectStatus(
    input: RailInspectStatusInput,
  ): Promise<RailInspectStatusResult> {
    return inspectStatusFromSessionApi(input, "local");
  },
  async inspectTimeline(
    input: RailInspectTimelineInput,
  ): Promise<RailInspectTimelineResult> {
    return inspectTimelineFromSessionApi(input, "local");
  },
};
