import type {
  NegotiationOffer,
  NegotiationResult,
  RfqBid,
  RfqRequest,
  RfqScoreWeights,
  RfqSelection,
} from "./types.js";

function isoNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function validateOffer(offer: NegotiationOffer) {
  const { terms } = offer;
  if (terms.liquidityBnb <= 0) {
    return "Liquidity contribution must be greater than zero.";
  }
  if (terms.raidCoverageHours < 1) {
    return "Raid coverage must be at least one hour.";
  }
  if (terms.revenueShareBpsAgentA + terms.revenueShareBpsAgentB !== 10000) {
    return "Revenue share must sum to 10000 bps.";
  }
  if (
    !terms.treasuryAddress.startsWith("0x") ||
    terms.treasuryAddress.length < 12
  ) {
    return "Treasury address is invalid.";
  }
  return null;
}

const DEFAULT_RFQ_WEIGHTS: RfqScoreWeights = {
  price: 0.35,
  eta: 0.2,
  reliability: 0.25,
  capabilityFit: 0.2,
};

function deterministicSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeWeights(
  scoreWeights?: Partial<RfqScoreWeights>,
): RfqScoreWeights {
  return {
    price: scoreWeights?.price ?? DEFAULT_RFQ_WEIGHTS.price,
    eta: scoreWeights?.eta ?? DEFAULT_RFQ_WEIGHTS.eta,
    reliability: scoreWeights?.reliability ?? DEFAULT_RFQ_WEIGHTS.reliability,
    capabilityFit:
      scoreWeights?.capabilityFit ?? DEFAULT_RFQ_WEIGHTS.capabilityFit,
  };
}

export function runRfqSelection(request: RfqRequest): RfqSelection {
  if (request.candidates.length === 0) {
    throw new Error("RFQ requires at least one candidate.");
  }

  const weights = normalizeWeights(request.scoreWeights);
  const bids: RfqBid[] = request.candidates.map((candidate) => {
    const seed = deterministicSeed(
      `${candidate.id}|${request.objective}|${request.requiredCapabilities.join(",")}`,
    );

    const quoteMin = Math.max(0.05, request.maxQuoteBnb * 0.35);
    const quoteMax = Math.max(quoteMin + 0.1, request.maxQuoteBnb * 1.15);
    const quoteRatio = (seed % 700) / 699;
    const rawQuote = quoteMin + (quoteMax - quoteMin) * quoteRatio;
    const quoteBnb = Number(rawQuote.toFixed(3));

    const etaMin = 8;
    const etaMax = Math.max(
      etaMin + 1,
      Math.floor(request.maxEtaMinutes * 1.2),
    );
    const etaMinutes = etaMin + (seed % (etaMax - etaMin + 1));

    const reliability = 70 + (seed % 31);

    const requiredSet = new Set(
      request.requiredCapabilities.map((capability) =>
        capability.toLowerCase(),
      ),
    );
    const matches = candidate.capabilities.filter((capability) =>
      requiredSet.has(capability.toLowerCase()),
    ).length;
    const capabilityFit = requiredSet.size
      ? clamp(Math.round((matches / requiredSet.size) * 100), 0, 100)
      : 100;

    const priceScore = clamp(
      ((request.maxQuoteBnb - quoteBnb) / request.maxQuoteBnb) * 100,
      0,
      100,
    );
    const etaScore = clamp(
      ((request.maxEtaMinutes - etaMinutes) / request.maxEtaMinutes) * 100,
      0,
      100,
    );

    const score = Number(
      (
        priceScore * weights.price +
        etaScore * weights.eta +
        reliability * weights.reliability +
        capabilityFit * weights.capabilityFit
      ).toFixed(2),
    );

    return {
      candidate,
      quoteBnb,
      etaMinutes,
      reliability,
      capabilityFit,
      score,
    };
  });

  bids.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.etaMinutes !== b.etaMinutes) return a.etaMinutes - b.etaMinutes;
    if (a.quoteBnb !== b.quoteBnb) return a.quoteBnb - b.quoteBnb;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  return {
    selected: bids[0],
    fallback: bids[1],
    bids,
  };
}

export function negotiateJointVenture(
  offer: NegotiationOffer,
): NegotiationResult {
  const validationError = validateOffer(offer);
  const transcript = [
    {
      speaker: offer.proposer.displayName,
      message: `Proposal: provide ${offer.terms.liquidityBnb} BNB if counterpart covers ${offer.terms.raidCoverageHours}h raid ops.`,
      at: isoNow(0),
    },
    {
      speaker: offer.counterparty.displayName,
      message: `Reviewing secrecy=${offer.secrecyLevel} and revenue split ${offer.terms.revenueShareBpsAgentA}/${offer.terms.revenueShareBpsAgentB}.`,
      at: isoNow(50),
    },
  ];

  if (offer.secrecyLevel === "sealed") {
    transcript.push(
      {
        speaker: offer.proposer.displayName,
        message:
          "[secret] Switching to sealed side-channel for tactical coordination.",
        at: isoNow(75),
      },
      {
        speaker: offer.counterparty.displayName,
        message: "[secret] Acknowledged. Sharing non-public execution timing.",
        at: isoNow(90),
      },
    );
  }

  if (validationError) {
    transcript.push({
      speaker: "Consensus Engine",
      message: `Rejected: ${validationError}`,
      at: isoNow(100),
    });
    return {
      accepted: false,
      consensusSummary: "Consensus failed.",
      rejectionReason: validationError,
      transcript,
    };
  }

  transcript.push({
    speaker: "Consensus Engine",
    message: "Consensus reached. Terms are bounded, balanced, and executable.",
    at: isoNow(100),
  });

  return {
    accepted: true,
    agreementId: `dm-${offer.proposer.id}-${offer.counterparty.id}-001`,
    consensusSummary:
      "Agent A supplies liquidity, Agent B supplies continuous raid operations, and revenue split is acceptable.",
    transcript,
  };
}
