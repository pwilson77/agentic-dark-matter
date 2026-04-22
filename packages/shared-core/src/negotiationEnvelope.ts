import { createHash, randomUUID } from "node:crypto";
import { Wallet, verifyMessage } from "ethers";
import type {
  JointVentureTerms,
  NegotiationEnvelope,
  NegotiationEnvelopePayload,
} from "./types.js";

function stableTermsHash(terms: JointVentureTerms): string {
  const canonical = {
    liquidityBnb: terms.liquidityBnb,
    raidCoverageHours: terms.raidCoverageHours,
    revenueShareBpsAgentA: terms.revenueShareBpsAgentA,
    revenueShareBpsAgentB: terms.revenueShareBpsAgentB,
    treasuryAddress: terms.treasuryAddress.toLowerCase(),
    notes: terms.notes,
  };
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function hashPayload(payload: NegotiationEnvelopePayload): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export interface CreateNegotiationEnvelopeInput {
  signerAgentId: string;
  signerPrivateKey: string;
  agreementId: string;
  objective: string;
  participants: [string, string];
  secrecyLevel: "private" | "sealed";
  terms: JointVentureTerms;
  nonce?: string;
  createdAt?: string;
}

export async function createNegotiationEnvelope(
  input: CreateNegotiationEnvelopeInput,
): Promise<NegotiationEnvelope> {
  const wallet = new Wallet(input.signerPrivateKey);
  const payload: NegotiationEnvelopePayload = {
    agreementId: input.agreementId,
    objective: input.objective,
    participants: [
      input.participants[0].toLowerCase(),
      input.participants[1].toLowerCase(),
    ],
    secrecyLevel: input.secrecyLevel,
    termsHash: stableTermsHash(input.terms),
    nonce: input.nonce || randomUUID(),
    createdAt: input.createdAt || new Date().toISOString(),
  };

  const payloadHash = hashPayload(payload);
  const signature = await wallet.signMessage(payloadHash);

  return {
    envelopeId: `env_${randomUUID()}`,
    signerAgentId: input.signerAgentId,
    signerAddress: wallet.address,
    payload,
    payloadHash,
    signature,
  };
}

export function verifyNegotiationEnvelope(envelope: NegotiationEnvelope): boolean {
  const recomputed = hashPayload(envelope.payload);
  if (recomputed !== envelope.payloadHash) return false;

  const recovered = verifyMessage(envelope.payloadHash, envelope.signature);
  return recovered.toLowerCase() === envelope.signerAddress.toLowerCase();
}
