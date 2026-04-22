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
  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}

function hashPayload(payload: NegotiationEnvelopePayload): string {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export interface CreateNegotiationEnvelopeInput {
  signerAgentId: string;
  signerPrivateKey: string;
  agreementId: string;
  objective: string;
  participants: [string, string];
  secrecyLevel: "private" | "sealed";
  terms: JointVentureTerms;
  deliveryCommitmentHash?: string;
  nonce?: string;
  createdAt?: string;
}

export interface ComputeDeliveryCommitmentInput {
  agreementId: string;
  objective: string;
  participants: [string, string];
  termsHash: string;
}

export function computeNegotiationDeliveryCommitmentHash(
  input: ComputeDeliveryCommitmentInput,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        agreementId: input.agreementId,
        objective: input.objective,
        participants: [
          input.participants[0].toLowerCase(),
          input.participants[1].toLowerCase(),
        ],
        termsHash: input.termsHash,
      }),
      "utf8",
    )
    .digest("hex");
}

export async function createNegotiationEnvelope(
  input: CreateNegotiationEnvelopeInput,
): Promise<NegotiationEnvelope> {
  const wallet = new Wallet(input.signerPrivateKey);
  const termsHash = stableTermsHash(input.terms);
  const deliveryCommitmentHash =
    input.deliveryCommitmentHash ||
    computeNegotiationDeliveryCommitmentHash({
      agreementId: input.agreementId,
      objective: input.objective,
      participants: input.participants,
      termsHash,
    });
  const payload: NegotiationEnvelopePayload = {
    agreementId: input.agreementId,
    objective: input.objective,
    participants: [
      input.participants[0].toLowerCase(),
      input.participants[1].toLowerCase(),
    ],
    secrecyLevel: input.secrecyLevel,
    termsHash,
    deliveryCommitmentHash,
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

export function verifyNegotiationEnvelope(
  envelope: NegotiationEnvelope,
): boolean {
  const recomputed = hashPayload(envelope.payload);
  if (recomputed !== envelope.payloadHash) return false;

  const recovered = verifyMessage(envelope.payloadHash, envelope.signature);
  return recovered.toLowerCase() === envelope.signerAddress.toLowerCase();
}

export interface ValidateNegotiationEnvelopeSetInput {
  envelopes: NegotiationEnvelope[];
  expectedAgreementId: string;
  expectedSignerAgentIds: string[];
  usedNonces: Set<string>;
  strict: boolean;
}

export function validateNegotiationEnvelopeSet(
  input: ValidateNegotiationEnvelopeSetInput,
): void {
  const {
    envelopes,
    expectedAgreementId,
    expectedSignerAgentIds,
    usedNonces,
    strict,
  } = input;
  if (envelopes.length === 0) {
    throw new Error(
      "Negotiation envelope policy failed: no envelopes were created.",
    );
  }

  const uniqueSignerIds = new Set<string>();
  const uniqueNonces = new Set<string>();
  const commitmentHashes = new Set<string>();

  for (const envelope of envelopes) {
    if (!verifyNegotiationEnvelope(envelope)) {
      throw new Error(
        `Negotiation envelope policy failed: invalid signature for ${envelope.signerAgentId}.`,
      );
    }
    if (envelope.payload.agreementId !== expectedAgreementId) {
      throw new Error(
        `Negotiation envelope policy failed: agreementId mismatch for ${envelope.signerAgentId}.`,
      );
    }
    if (
      typeof envelope.payload.deliveryCommitmentHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(envelope.payload.deliveryCommitmentHash)
    ) {
      throw new Error(
        `Negotiation envelope policy failed: missing or invalid delivery commitment for ${envelope.signerAgentId}.`,
      );
    }
    const nonce = envelope.payload.nonce;
    if (usedNonces.has(nonce)) {
      throw new Error(
        `Negotiation envelope policy failed: replayed nonce detected (${nonce}).`,
      );
    }
    if (uniqueNonces.has(nonce)) {
      throw new Error(
        `Negotiation envelope policy failed: duplicate nonce within envelope set (${nonce}).`,
      );
    }
    uniqueNonces.add(nonce);
    uniqueSignerIds.add(envelope.signerAgentId);
    commitmentHashes.add(envelope.payload.deliveryCommitmentHash.toLowerCase());
  }

  if (commitmentHashes.size > 1) {
    throw new Error(
      "Negotiation envelope policy failed: inconsistent delivery commitments across signers.",
    );
  }

  if (strict) {
    for (const signerId of expectedSignerAgentIds) {
      if (!uniqueSignerIds.has(signerId)) {
        throw new Error(
          `Negotiation envelope policy failed: missing required signer envelope (${signerId}).`,
        );
      }
    }
  }
}
