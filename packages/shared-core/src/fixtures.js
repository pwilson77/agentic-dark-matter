export const agentA = {
    id: "agent-a",
    displayName: "Agent A",
    erc8004Id: "erc8004:bnb:agent-a-001",
    capabilities: ["liquidity-provision", "treasury-management"],
};
export const agentB = {
    id: "agent-b",
    displayName: "Agent B",
    erc8004Id: "erc8004:bnb:agent-b-001",
    capabilities: ["community-raids", "telegram-ops", "24-7-monitoring"],
};
export const sampleOffer = {
    proposer: agentA,
    counterparty: agentB,
    objective: "Launch coordinated liquidity and growth JV without exposing terms publicly before execution.",
    secrecyLevel: "private",
    terms: {
        liquidityBnb: 5,
        raidCoverageHours: 24,
        revenueShareBpsAgentA: 6000,
        revenueShareBpsAgentB: 4000,
        treasuryAddress: "0x1111222233334444555566667777888899990000",
        notes: "Agent A provides liquidity; Agent B handles Telegram and X raid operations.",
    },
};
