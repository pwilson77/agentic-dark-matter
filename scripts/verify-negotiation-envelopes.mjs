#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createNegotiationEnvelope,
  validateNegotiationEnvelopeSet,
} from "@adm/shared-core";

const AGENT_A_KEY =
  process.env.AGENT_A_PRIVATE_KEY ||
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const AGENT_B_KEY =
  process.env.AGENT_B_PRIVATE_KEY ||
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const baseInput = {
  agreementId: "agreement-test-001",
  objective: "Coordinate launch raid",
  participants: [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ],
  secrecyLevel: "private",
  terms: {
    liquidityBnb: 1,
    raidCoverageHours: 24,
    revenueShareBpsAgentA: 6000,
    revenueShareBpsAgentB: 4000,
    treasuryAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    notes: "test",
  },
};

async function main() {
  const envA = await createNegotiationEnvelope({
    ...baseInput,
    signerAgentId: "agent-a",
    signerPrivateKey: AGENT_A_KEY,
    nonce: "nonce-a",
  });
  const envB = await createNegotiationEnvelope({
    ...baseInput,
    signerAgentId: "agent-b",
    signerPrivateKey: AGENT_B_KEY,
    nonce: "nonce-b",
  });

  validateNegotiationEnvelopeSet({
    envelopes: [envA, envB],
    expectedAgreementId: baseInput.agreementId,
    expectedSignerAgentIds: ["agent-a", "agent-b"],
    usedNonces: new Set(),
    strict: true,
  });

  await assert.rejects(async () => {
    const tampered = { ...envA, signature: `${envA.signature.slice(0, -2)}aa` };
    validateNegotiationEnvelopeSet({
      envelopes: [tampered, envB],
      expectedAgreementId: baseInput.agreementId,
      expectedSignerAgentIds: ["agent-a", "agent-b"],
      usedNonces: new Set(),
      strict: true,
    });
  }, /invalid signature/i);

  await assert.rejects(async () => {
    validateNegotiationEnvelopeSet({
      envelopes: [envA, envB],
      expectedAgreementId: baseInput.agreementId,
      expectedSignerAgentIds: ["agent-a", "agent-b"],
      usedNonces: new Set(["nonce-a"]),
      strict: true,
    });
  }, /replayed nonce/i);

  await assert.rejects(async () => {
    const mismatched = await createNegotiationEnvelope({
      ...baseInput,
      signerAgentId: "agent-b",
      signerPrivateKey: AGENT_B_KEY,
      nonce: "nonce-c",
      deliveryCommitmentHash: "f".repeat(64),
    });
    validateNegotiationEnvelopeSet({
      envelopes: [envA, mismatched],
      expectedAgreementId: baseInput.agreementId,
      expectedSignerAgentIds: ["agent-a", "agent-b"],
      usedNonces: new Set(),
      strict: true,
    });
  }, /inconsistent delivery commitments/i);

  console.log("[verify-negotiation-envelopes] PASS");
}

main().catch((error) => {
  console.error(
    `[verify-negotiation-envelopes] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
