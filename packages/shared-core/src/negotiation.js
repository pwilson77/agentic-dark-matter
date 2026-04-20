function isoNow(offsetMs = 0) {
    return new Date(Date.now() + offsetMs).toISOString();
}
function validateOffer(offer) {
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
    if (!terms.treasuryAddress.startsWith("0x") ||
        terms.treasuryAddress.length < 12) {
        return "Treasury address is invalid.";
    }
    return null;
}
export function negotiateJointVenture(offer) {
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
        transcript.push({
            speaker: offer.proposer.displayName,
            message: "[secret] Switching to sealed side-channel for tactical coordination.",
            at: isoNow(75),
        }, {
            speaker: offer.counterparty.displayName,
            message: "[secret] Acknowledged. Sharing non-public execution timing.",
            at: isoNow(90),
        });
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
        consensusSummary: "Agent A supplies liquidity, Agent B supplies continuous raid operations, and revenue split is acceptable.",
        transcript,
    };
}
