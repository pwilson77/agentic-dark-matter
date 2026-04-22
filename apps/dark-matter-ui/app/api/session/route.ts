import { NextResponse } from "next/server";
import { Interface, JsonRpcProvider, formatEther, id } from "ethers";
import { readFile as fsReadFile } from "node:fs/promises";

type PoolStatus = "live" | "settling" | "completed" | "watchlist";

type TimelineStatus = "info" | "ok" | "warn";
type OperatorActionType =
  | "retry-step"
  | "force-reveal-public-summary"
  | "escalate-dispute";

interface OperatorActionResponse {
  requestId: string;
  poolId: string;
  action: OperatorActionType;
  status: "accepted" | "rejected";
  detail: string;
  createdAt: string;
  summary?: string;
  onChainTxHash?: string;
}

interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  status: TimelineStatus;
  actionAllowed?: OperatorActionType[];
  actionResponse?: OperatorActionResponse;
  actionGraphHash?: string;
  actionGraphStorageRef?: string;
}

interface DiscoveryAgent {
  agentId: number;
  name: string;
  wallet: string;
  capabilities: string[];
  fitScore: number;
}

interface RankedCandidate {
  rank: number;
  agent: string;
  score: number;
  quoteBnb: number;
  etaMinutes: number;
  rationale: string;
}

interface SettlementProof {
  agreementHash: string;
  contractAddress: string;
  deploymentTxHash?: string;
  deploymentBlockNumber?: number;
  releaseTxHash: string;
  transcriptHash: string;
  released: boolean;
  escrowBnb: number;
  agentAApprovalTxHash?: string;
  agentAApprovalBlockNumber?: number;
  agentBApprovalTxHash?: string;
  agentBApprovalBlockNumber?: number;
  agentBApprovalActor?: string;
}

interface PoolItem {
  id: string;
  name: string;
  status: PoolStatus;
  strategy: string;
  network: string;
  capability: string;
  updatedAt: string;
  progress: number;
  discoveredAgents: DiscoveryAgent[];
  rankedCandidates: RankedCandidate[];
  settlement: SettlementProof;
  timeline: TimelineEvent[];
}

interface PoolsResponse {
  ok: boolean;
  source: "mock" | "local" | "prod";
  generatedAt: string;
  selectedPoolId: string;
  pools: PoolItem[];
}

type PoolSource = PoolsResponse["source"];

const ESCROW_EVENTS_ABI = [
  "event AgreementCreated(address indexed agentA, address indexed agentB, address indexed treasury, uint16 revenueShareBpsAgentA, uint16 revenueShareBpsAgentB, uint256 initialBalance)",
  "event SettlementReleased(address indexed treasury, uint256 amount, address indexed triggeredBy)",
  "event SettlementAutoClaimed(address indexed claimer, address indexed treasury, uint256 amount)",
  "event PoolCreated(bytes32 indexed poolId, address indexed contractAddress, string status, uint256 balance)",
  "event PoolStatusChanged(bytes32 indexed poolId, string status, address indexed actor)",
] as const;

const MOCK_POOLS: PoolItem[] = [
  {
    id: "pool-bnb-growth-01",
    name: "BNB Growth Syndicate",
    status: "live",
    strategy: "Liquidity + social growth",
    network: "bsc-testnet",
    capability: "community raids + treasury support",
    updatedAt: "2026-04-18T18:52:00Z",
    progress: 64,
    discoveredAgents: [
      {
        agentId: 12,
        name: "RaidForge",
        wallet: "0xA431...3Ed2",
        capabilities: ["telegram raids", "x campaign sync"],
        fitScore: 92,
      },
      {
        agentId: 27,
        name: "YieldMesh",
        wallet: "0xA77B...d190",
        capabilities: ["treasury strategy", "pool calibration"],
        fitScore: 88,
      },
      {
        agentId: 33,
        name: "PulseRelay",
        wallet: "0x5CD2...78B4",
        capabilities: ["engagement monitoring", "alerting"],
        fitScore: 83,
      },
    ],
    rankedCandidates: [
      {
        rank: 1,
        agent: "RaidForge",
        score: 93,
        quoteBnb: 1.8,
        etaMinutes: 32,
        rationale: "Best fit to capability + strongest response SLA",
      },
      {
        rank: 2,
        agent: "YieldMesh",
        score: 89,
        quoteBnb: 2.1,
        etaMinutes: 40,
        rationale: "Strong treasury profile, slightly higher quote",
      },
      {
        rank: 3,
        agent: "PulseRelay",
        score: 84,
        quoteBnb: 1.5,
        etaMinutes: 55,
        rationale: "Good price but weaker depth for this task",
      },
    ],
    settlement: {
      agreementHash:
        "0x94951649aaf4c51c8b23d576c7e9a2dfee1a77978c142af8736a66c5a71f219d",
      contractAddress: "0x29A2b8f4f32Bc92735f5d98E6578fcA2531fA904",
      releaseTxHash:
        "0xbd241ab20a5b032fd844de0f85fd6d37b5cf8d66327d4b1975e6f720a228770a",
      transcriptHash:
        "0x9053cd716f13528611012171fd0a9224d2ad744f00fae8e5518cf97735886a56",
      released: false,
      escrowBnb: 5,
    },
    timeline: [
      {
        id: "t-1",
        at: "18:44:03",
        title: "Discovery started",
        detail: "Scanning ERC-8004 identities for target capabilities",
        status: "info",
      },
      {
        id: "t-2",
        at: "18:44:27",
        title: "3 candidates matched",
        detail: "Capability and wallet checks passed",
        status: "ok",
      },
      {
        id: "t-3",
        at: "18:45:09",
        title: "RFQ round opened",
        detail: "Quotes requested from top 3 candidates",
        status: "info",
      },
      {
        id: "t-4",
        at: "18:45:52",
        title: "Winner selected",
        detail: "RaidForge selected by weighted score",
        status: "ok",
      },
    ],
  },
  {
    id: "pool-meme-launch-02",
    name: "Meme Launch Guard",
    status: "settling",
    strategy: "Launch defense and liquidity containment",
    network: "bsc-testnet",
    capability: "launch monitoring + market making",
    updatedAt: "2026-04-18T18:48:00Z",
    progress: 84,
    discoveredAgents: [
      {
        agentId: 7,
        name: "SentinelMM",
        wallet: "0x3f10...820A",
        capabilities: ["market making", "spread guard"],
        fitScore: 94,
      },
      {
        agentId: 19,
        name: "FlowOracle",
        wallet: "0xE412...2f49",
        capabilities: ["flow analysis", "risk alerts"],
        fitScore: 90,
      },
    ],
    rankedCandidates: [
      {
        rank: 1,
        agent: "SentinelMM",
        score: 95,
        quoteBnb: 2.6,
        etaMinutes: 22,
        rationale: "Highest defense quality and fastest readiness",
      },
      {
        rank: 2,
        agent: "FlowOracle",
        score: 90,
        quoteBnb: 2.2,
        etaMinutes: 37,
        rationale: "Strong analytics profile; lower execution breadth",
      },
    ],
    settlement: {
      agreementHash:
        "0xde9f2d6b9105a488609de89bf2f8f1f89cb44f5704f5f934f93d4c81a86e97db",
      contractAddress: "0x6E7f0c344b9D729A5E2A267f8B4E8aA8A4f15AcB",
      releaseTxHash:
        "0x8b2b516758c66a9a0b71d29b9b87be242f7078bf6afb95dd9f3f0374a3e3f2ab",
      transcriptHash:
        "0x5a4f2938d99759b764f9ec2ab5f2018201719e2e4b05bbf5f1f856cf6a24f7de",
      released: false,
      escrowBnb: 7.5,
    },
    timeline: [
      {
        id: "m-1",
        at: "18:40:12",
        title: "Pool activated",
        detail: "Launch defense objective confirmed",
        status: "info",
      },
      {
        id: "m-2",
        at: "18:41:39",
        title: "Consensus reached",
        detail: "Term sheet approved by both counterparties",
        status: "ok",
      },
      {
        id: "m-3",
        at: "18:44:10",
        title: "Escrow pending release",
        detail: "Waiting for final release authorization",
        status: "warn",
      },
    ],
  },
  {
    id: "pool-crosschain-03",
    name: "Cross-Chain Signal Relay",
    status: "watchlist",
    strategy: "Signal arbitrage and staged execution",
    network: "base-sepolia",
    capability: "cross-chain intelligence",
    updatedAt: "2026-04-18T18:45:00Z",
    progress: 38,
    discoveredAgents: [
      {
        agentId: 46,
        name: "RelayPilot",
        wallet: "0x90bA...A191",
        capabilities: ["cross-chain relay", "latency optimization"],
        fitScore: 87,
      },
      {
        agentId: 54,
        name: "PathLens",
        wallet: "0x4D12...A2a0",
        capabilities: ["route intelligence", "bridge health"],
        fitScore: 85,
      },
    ],
    rankedCandidates: [
      {
        rank: 1,
        agent: "RelayPilot",
        score: 88,
        quoteBnb: 1.2,
        etaMinutes: 65,
        rationale: "Most complete chain coverage for relay objectives",
      },
      {
        rank: 2,
        agent: "PathLens",
        score: 84,
        quoteBnb: 1,
        etaMinutes: 75,
        rationale: "Lower quote but narrower execution surface",
      },
    ],
    settlement: {
      agreementHash:
        "0xc3fd9e524dfe506f11a5d9d31fc97f6cce6404f3db8c2ff0566a44f4502d2f72",
      contractAddress: "0x0000000000000000000000000000000000000000",
      releaseTxHash: "",
      transcriptHash:
        "0xa2106f58de07f4ccf303f8f637f2f769cc6629888542b3f7d5d912f89ff9701d",
      released: false,
      escrowBnb: 2,
    },
    timeline: [
      {
        id: "c-1",
        at: "18:36:44",
        title: "Watchlist queued",
        detail: "Pool queued for operator approval",
        status: "info",
      },
      {
        id: "c-2",
        at: "18:41:02",
        title: "Counterparty shortlist built",
        detail: "2 candidates passed baseline checks",
        status: "ok",
      },
    ],
  },
  {
    id: "pool-postmortem-04",
    name: "Post-Settlement Replay",
    status: "completed",
    strategy: "Deterministic replay and audit export",
    network: "bsc-testnet",
    capability: "audit trace generation",
    updatedAt: "2026-04-18T18:39:00Z",
    progress: 100,
    discoveredAgents: [
      {
        agentId: 73,
        name: "AuditBloom",
        wallet: "0xF105...d490",
        capabilities: ["trace export", "evidence packaging"],
        fitScore: 96,
      },
    ],
    rankedCandidates: [
      {
        rank: 1,
        agent: "AuditBloom",
        score: 97,
        quoteBnb: 0.7,
        etaMinutes: 15,
        rationale: "Specialized for post-settlement reporting",
      },
    ],
    settlement: {
      agreementHash:
        "0x76195f6d874acf105e1f2a8f76d64751f1ce5c6bd1136b33296bd338c6b6b495",
      contractAddress: "0x8a9Df7Ca6388a5f35f5A624de61254703Dbf76D2",
      releaseTxHash:
        "0x26e2f31fafafe0d92ec45e55f2ad5e95a63431a90d2fe31ea4de1a52df4224f8",
      transcriptHash:
        "0xc845f8691ce2c742f8c4a7fceebdc48b1da5b7aa3907ec67390f2a18e4524fd9",
      released: true,
      escrowBnb: 1,
    },
    timeline: [
      {
        id: "p-1",
        at: "18:29:01",
        title: "Discovery complete",
        detail: "Single specialist candidate selected",
        status: "ok",
      },
      {
        id: "p-2",
        at: "18:32:40",
        title: "Settlement released",
        detail: "Escrow released and evidence hashes finalized",
        status: "ok",
      },
      {
        id: "p-3",
        at: "18:35:18",
        title: "Audit package exported",
        detail: "Artifacts ready for public proof dashboard",
        status: "ok",
      },
    ],
  },
];

function toLocalPools(pools: PoolItem[]): PoolItem[] {
  const nowIso = new Date().toISOString();
  const localA =
    process.env.DARK_MATTER_AGENT_A_ADDRESS ||
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const localB =
    process.env.DARK_MATTER_AGENT_B_ADDRESS ||
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  return pools.map((pool, index) => ({
    ...pool,
    id: `local-${pool.id}`,
    name: `${pool.name} (Local)`,
    network: "anvil-local (31337)",
    updatedAt: nowIso,
    progress: Math.min(100, pool.progress + 8),
    discoveredAgents: pool.discoveredAgents.map((agent, agentIndex) => ({
      ...agent,
      wallet: agentIndex % 2 === 0 ? localA : localB,
    })),
    settlement: {
      ...pool.settlement,
      contractAddress:
        index === 0
          ? "0x5FbDB2315678afecb367f032d93F642f64180aa3"
          : pool.settlement.contractAddress,
      releaseTxHash:
        pool.settlement.releaseTxHash ||
        "0x4ce3f1f6e9f6f6761ea9933342ee2cf69d0f8ce4f81b53f3ec0b6ab4f0e8bd08",
    },
  }));
}

function toProdPools(pools: PoolItem[]): PoolItem[] {
  return pools.map((pool) => ({
    ...pool,
    name: `${pool.name} (Prod Preview)`,
    strategy: `${pool.strategy} / production indexing preview`,
  }));
}

function resolvePoolSource(sourceInput?: string | null): PoolSource {
  const source = (
    sourceInput ||
    process.env.POOL_SOURCE ||
    "local"
  ).toLowerCase();
  if (source === "local") return "local";
  if (source === "prod") return "prod";
  return "mock";
}

function poolsForSource(source: PoolSource): PoolItem[] {
  if (source === "prod") {
    return toProdPools(MOCK_POOLS);
  }
  return MOCK_POOLS;
}

interface SessionEventLike {
  step?: string;
  detail?: string;
  timestamp?: string;
  status?: "info" | "ok" | "warn";
  id?: string;
  meta?: {
    actionGraphHash?: string;
    actionGraphStorageRef?: string;
    [key: string]: unknown;
  };
}

function isSecretTranscriptLine(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("[secret]") ||
    normalized.includes("[private]") ||
    normalized.includes("[internal]")
  );
}

async function loadChatTimelineEvents(): Promise<TimelineEvent[]> {
  const sessionFile =
    process.env.DARK_MATTER_SESSION_FILE ||
    "/tmp/agentic-dark-matter-session.jsonl";

  let raw = "";
  try {
    raw = await fsReadFile(sessionFile, "utf8");
  } catch {
    return [];
  }

  const transcriptEntries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as SessionEventLike;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is SessionEventLike => !!entry)
    .filter((entry) => entry.step === "transcript" && !!entry.detail);

  if (transcriptEntries.length === 0) {
    return [];
  }

  const secretEntries = transcriptEntries.filter((entry) =>
    isSecretTranscriptLine(String(entry.detail || "")),
  ).length;

  const visibleEntries = transcriptEntries.filter(
    (entry) => !isSecretTranscriptLine(String(entry.detail || "")),
  );

  const timeline: TimelineEvent[] = visibleEntries.map((entry, index) => {
    const detail = String(entry.detail || "");
    const parts = detail.split(":");
    const speaker = parts.length > 1 ? parts[0].trim() : "Agent";
    const message = parts.length > 1 ? parts.slice(1).join(":").trim() : detail;

    return {
      id: `chat-${index + 1}`,
      at: entry.timestamp || "recent",
      title: `${speaker} chat`,
      detail: message,
      status: "info",
    };
  });

  if (secretEntries > 0) {
    timeline.unshift({
      id: "chat-visibility-policy",
      at: "recent",
      title: "Hidden agent-only lines",
      detail: `${secretEntries} transcript line(s) were marked non-public by agents.`,
      status: "warn",
      actionAllowed: ["force-reveal-public-summary"],
    });
  }

  return timeline;
}

function negotiatedPoolTitleFromTimeline(
  timeline: TimelineEvent[],
): string | undefined {
  const proposalEvent = timeline.find((event) =>
    event.detail.toLowerCase().includes("proposal"),
  );
  if (!proposalEvent) return undefined;

  const detail = proposalEvent.detail.trim();
  const normalized = detail.replace(/^proposal\s*:\s*/i, "").trim();
  if (!normalized) return undefined;

  const compact = normalized.replace(/\s+/g, " ");
  const capped = compact.length > 62 ? `${compact.slice(0, 59)}...` : compact;
  return `Negotiated: ${capped}`;
}

async function loadRfqTimelineEvents(): Promise<TimelineEvent[]> {
  const stateFile = process.env.AGENT_STATE_FILE || "/tmp/adm-agent-state.json";

  let raw = "";
  try {
    raw = await fsReadFile(stateFile, "utf8");
  } catch {
    return [];
  }

  const state = (() => {
    try {
      return JSON.parse(raw) as {
        agreements?: Array<{
          agreementId?: string;
          createdAt?: string;
          meta?: {
            rfq?: {
              selected?: {
                id?: string;
                displayName?: string;
                score?: number;
                quoteBnb?: number;
                etaMinutes?: number;
              };
              fallback?: {
                id?: string;
                displayName?: string;
                score?: number;
              } | null;
            };
          };
        }>;
      };
    } catch {
      return { agreements: [] };
    }
  })();

  const agreements = state.agreements || [];
  const latestWithRfq = agreements
    .slice()
    .reverse()
    .find((agreement) => !!agreement.meta?.rfq?.selected);

  if (!latestWithRfq?.meta?.rfq?.selected) {
    return [];
  }

  const selected = latestWithRfq.meta.rfq.selected;
  const fallback = latestWithRfq.meta.rfq.fallback;

  return [
    {
      id: `rfq-${latestWithRfq.agreementId || "latest"}`,
      at: latestWithRfq.createdAt || "recent",
      title: "RFQ counterparty selected",
      detail: `${selected.displayName || selected.id || "candidate"} won RFQ (score ${selected.score ?? "n/a"}, quote ${selected.quoteBnb ?? "n/a"} BNB, ETA ${selected.etaMinutes ?? "n/a"}m)${fallback ? `; fallback ${fallback.displayName || fallback.id || "candidate"} (score ${fallback.score ?? "n/a"})` : ""}.`,
      status: "ok",
    },
  ];
}

async function loadSystemTimelineEvents(): Promise<TimelineEvent[]> {
  const sessionFile =
    process.env.DARK_MATTER_SESSION_FILE ||
    "/tmp/agentic-dark-matter-session.jsonl";

  let raw = "";
  try {
    raw = await fsReadFile(sessionFile, "utf8");
  } catch {
    return [];
  }

  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as SessionEventLike;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is SessionEventLike => !!entry);

  const actionGraph = entries
    .filter((entry) => entry.step === "action-graph")
    .map((entry, index) => ({
      id: entry.id || `graph-${index + 1}`,
      at: entry.timestamp || "recent",
      title: "Action graph persisted",
      detail:
        entry.detail || "Action graph artifact was persisted for this run.",
      status: (entry.status || "ok") as TimelineStatus,
      actionGraphHash: entry.meta?.actionGraphHash,
      actionGraphStorageRef: entry.meta?.actionGraphStorageRef,
    }));

  const operatorActions = entries
    .filter((entry) => entry.step === "operator-action")
    .map((entry, index) => {
      const meta = entry.meta as
        | {
            requestId?: string;
            poolId?: string;
            action?: OperatorActionType;
            status?: "accepted" | "rejected";
            detail?: string;
            createdAt?: string;
            summary?: string;
            onChainTxHash?: string;
          }
        | undefined;

      const response: OperatorActionResponse | undefined = meta
        ? {
            requestId: meta.requestId || `operator-${index + 1}`,
            poolId: meta.poolId || "",
            action: meta.action || "retry-step",
            status: meta.status || "accepted",
            detail: meta.detail || entry.detail || "Operator action recorded.",
            createdAt: meta.createdAt || entry.timestamp || "recent",
            summary: meta.summary,
            onChainTxHash: meta.onChainTxHash,
          }
        : undefined;

      return {
        id: entry.id || `operator-${index + 1}`,
        at: entry.timestamp || "recent",
        title: "Operator action",
        detail: entry.detail || "Operator action recorded.",
        status: (entry.status || "info") as TimelineStatus,
        actionResponse: response,
      } satisfies TimelineEvent;
    });

  return [...actionGraph, ...operatorActions];
}

function statusFromEvent(statusValue: string | undefined): PoolStatus {
  const normalized = (statusValue || "").toLowerCase();
  if (
    normalized.includes("released") ||
    normalized.includes("auto-claimed") ||
    normalized.includes("timeout")
  ) {
    return "completed";
  }
  if (normalized.includes("approved")) return "settling";
  if (normalized.includes("created")) return "live";
  return "watchlist";
}

function progressFromStatus(status: PoolStatus): number {
  if (status === "completed") return 100;
  if (status === "settling") return 76;
  if (status === "live") return 42;
  return 18;
}

interface LocalOnChainPool {
  contractAddress: string;
  poolId: string;
  latestStatus: PoolStatus;
  lastStatusRaw: string;
  releaseTxHash: string;
  initialBalanceWei: bigint;
  agentA: string;
  agentB: string;
  treasury: string;
  agentAApprovalTxHash: string;
  agentAApprovalBlockNumber: number;
  agentBApprovalTxHash: string;
  agentBApprovalBlockNumber: number;
  agentBApprovalActor: string;
}

interface RuntimeStateBid {
  bidId?: string;
  agentId?: string;
  agentDisplayName?: string;
  agentAddress?: string;
  capabilities?: string[];
  quoteBnb?: number;
  etaMinutes?: number;
  rationale?: string;
  submittedAt?: string;
}

interface RuntimeStateRfq {
  rfqId?: string;
  capability?: string;
  secondaryCapabilities?: string[];
  objective?: string;
  budgetBnb?: number;
  maxEtaMinutes?: number;
  postedAt?: string;
  minBids?: number;
  status?: string;
  bids?: RuntimeStateBid[];
  selection?: {
    winnerBidId?: string;
    winnerAgentId?: string;
    winnerAddress?: string;
    reasoning?: string;
    decidedAt?: string;
  };
  agreementId?: string;
}

interface RuntimeStateAgreement {
  agreementId?: string;
  contractAddress?: string;
  deployTxHash?: string | null;
  deployBlockNumber?: number | null;
  agentA?: string;
  agentB?: string;
  status?: string;
  approvals?: string[];
  approveTxHashes?: Record<string, string>;
  releaseTxHash?: string | null;
  createdAt?: string;
  meta?: {
    agreementHash?: string;
    transcriptHash?: string;
    rfqId?: string;
    winner?: {
      agentId?: string;
      displayName?: string;
      reasoning?: string;
      quoteBnb?: number;
      etaMinutes?: number;
    };
    bids?: Array<{
      agentId?: string;
      quoteBnb?: number;
      etaMinutes?: number;
      rationale?: string;
    }>;
    deliveryProof?: {
      proofHash?: string;
      submittedAt?: string;
    };
    // legacy shape — kept for backward compat with old fixtures
    rfq?: {
      selected?: {
        id?: string;
        displayName?: string;
        score?: number;
        quoteBnb?: number;
        etaMinutes?: number;
      };
    };
  };
}

interface LiveTimelineEvent {
  cursor: number;
  poolId: string;
  poolName: string;
  event: TimelineEvent;
}

interface LiveTimelineResponse {
  ok: boolean;
  source: PoolSource;
  generatedAt: string;
  cursor: number;
  events: LiveTimelineEvent[];
}

function buildLiveTimeline(
  pools: PoolItem[],
  source: PoolSource,
  sinceCursor: number,
): LiveTimelineResponse {
  const flattened = pools.flatMap((pool) =>
    pool.timeline.map((event) => ({
      poolId: pool.id,
      poolName: pool.name,
      event,
    })),
  );

  const currentCursor = flattened.length;
  const start = Math.max(0, sinceCursor);
  const events = flattened.slice(start).map((entry, index) => ({
    cursor: start + index + 1,
    poolId: entry.poolId,
    poolName: entry.poolName,
    event: entry.event,
  }));

  return {
    ok: true,
    source,
    generatedAt: new Date().toISOString(),
    cursor: currentCursor,
    events,
  };
}

async function loadLocalPoolsFromChain(): Promise<PoolItem[]> {
  const rpcUrl = process.env.DARK_MATTER_RPC_URL || "http://127.0.0.1:8545";
  const provider = new JsonRpcProvider(rpcUrl);
  const iface = new Interface(ESCROW_EVENTS_ABI);

  const fromBlock = Number.parseInt(
    process.env.DARK_MATTER_LOCAL_FROM_BLOCK || "0",
    10,
  );
  const toBlock = "latest" as const;

  const poolCreatedTopic = id("PoolCreated(bytes32,address,string,uint256)");
  const statusChangedTopic = id("PoolStatusChanged(bytes32,string,address)");
  const agreementCreatedTopic = id(
    "AgreementCreated(address,address,address,uint16,uint16,uint256)",
  );
  const settlementReleasedTopic = id(
    "SettlementReleased(address,uint256,address)",
  );
  const settlementAutoClaimedTopic = id(
    "SettlementAutoClaimed(address,address,uint256)",
  );

  const [
    poolCreatedLogs,
    statusLogs,
    agreementLogs,
    releasedLogs,
    autoClaimLogs,
  ] = await Promise.all([
    provider.getLogs({ fromBlock, toBlock, topics: [poolCreatedTopic] }),
    provider.getLogs({ fromBlock, toBlock, topics: [statusChangedTopic] }),
    provider.getLogs({ fromBlock, toBlock, topics: [agreementCreatedTopic] }),
    provider.getLogs({
      fromBlock,
      toBlock,
      topics: [settlementReleasedTopic],
    }),
    provider.getLogs({
      fromBlock,
      toBlock,
      topics: [settlementAutoClaimedTopic],
    }),
  ]);

  const poolMap = new Map<string, LocalOnChainPool>();

  for (const log of poolCreatedLogs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;

    const contractAddress = String(parsed.args.contractAddress).toLowerCase();
    const poolId = String(parsed.args.poolId);
    const statusRaw = String(parsed.args.status);
    const balance = parsed.args.balance as bigint;

    poolMap.set(contractAddress, {
      contractAddress,
      poolId,
      latestStatus: statusFromEvent(statusRaw),
      lastStatusRaw: statusRaw,
      releaseTxHash: "",
      initialBalanceWei: balance,
      agentA: "",
      agentB: "",
      treasury: "",
      agentAApprovalTxHash: "",
      agentAApprovalBlockNumber: 0,
      agentBApprovalTxHash: "",
      agentBApprovalBlockNumber: 0,
      agentBApprovalActor: "",
    });
  }

  for (const log of agreementLogs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const contractAddress = log.address.toLowerCase();

    const existing = poolMap.get(contractAddress) || {
      contractAddress,
      poolId: `0x${contractAddress.slice(2).padStart(64, "0")}`,
      latestStatus: "live" as PoolStatus,
      lastStatusRaw: "created",
      releaseTxHash: "",
      initialBalanceWei: parsed.args.initialBalance as bigint,
      agentA: "",
      agentB: "",
      treasury: "",
      agentAApprovalTxHash: "",
      agentAApprovalBlockNumber: 0,
      agentBApprovalTxHash: "",
      agentBApprovalBlockNumber: 0,
      agentBApprovalActor: "",
    };

    existing.agentA = String(parsed.args.agentA);
    existing.agentB = String(parsed.args.agentB);
    existing.treasury = String(parsed.args.treasury);
    existing.initialBalanceWei = parsed.args.initialBalance as bigint;
    poolMap.set(contractAddress, existing);
  }

  for (const log of statusLogs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const contractAddress = log.address.toLowerCase();
    const statusRaw = String(parsed.args.status);
    const actor = String(parsed.args.actor || "").toLowerCase();

    const existing = poolMap.get(contractAddress);
    if (!existing) continue;
    existing.lastStatusRaw = statusRaw;
    existing.latestStatus = statusFromEvent(statusRaw);

    if (statusRaw.toLowerCase().includes("approved")) {
      const agentALower = existing.agentA.toLowerCase();
      const agentBLower = existing.agentB.toLowerCase();

      if (actor && actor === agentALower) {
        existing.agentAApprovalTxHash = log.transactionHash;
        existing.agentAApprovalBlockNumber = Number(log.blockNumber || 0);
      }

      if (actor && actor === agentBLower) {
        existing.agentBApprovalTxHash = log.transactionHash;
        existing.agentBApprovalBlockNumber = Number(log.blockNumber || 0);
        existing.agentBApprovalActor = actor;
      }
    }
  }

  for (const log of releasedLogs) {
    const contractAddress = log.address.toLowerCase();
    const existing = poolMap.get(contractAddress);
    if (!existing) continue;
    existing.releaseTxHash = log.transactionHash;
    existing.latestStatus = "completed";
    existing.lastStatusRaw = "released";
  }

  for (const log of autoClaimLogs) {
    const contractAddress = log.address.toLowerCase();
    const existing = poolMap.get(contractAddress);
    if (!existing) continue;
    existing.releaseTxHash = log.transactionHash;
    existing.latestStatus = "completed";
    existing.lastStatusRaw = "auto-claimed-timeout";
  }

  const pools = Array.from(poolMap.values()).map((pool, index) => {
    const progress = progressFromStatus(pool.latestStatus);
    const initialBalanceBnb = Number.parseFloat(
      formatEther(pool.initialBalanceWei),
    );
    const shortId = pool.poolId.slice(2, 10);

    return {
      id: `local-${shortId}`,
      name: `Local Pool ${index + 1}`,
      status: pool.latestStatus,
      strategy: "On-chain execution path from local escrow lifecycle",
      network: "anvil-local (31337)",
      capability: "liquidity + operator coordination",
      updatedAt: new Date().toISOString(),
      progress,
      discoveredAgents: [
        {
          agentId: index * 2 + 1,
          name: "Agent A",
          wallet: pool.agentA || "0x0000000000000000000000000000000000000000",
          capabilities: ["liquidity provision", "treasury setup"],
          fitScore: 90,
        },
        {
          agentId: index * 2 + 2,
          name: "Agent B",
          wallet: pool.agentB || "0x0000000000000000000000000000000000000000",
          capabilities: ["operations", "execution"],
          fitScore: 88,
        },
      ],
      rankedCandidates: [
        {
          rank: 1,
          agent: "Agent A",
          score: 90,
          quoteBnb: Number((initialBalanceBnb * 0.2).toFixed(2)),
          etaMinutes: 30,
          rationale: "Primary liquidity owner in local execution flow",
        },
        {
          rank: 2,
          agent: "Agent B",
          score: 88,
          quoteBnb: Number((initialBalanceBnb * 0.16).toFixed(2)),
          etaMinutes: 34,
          rationale: "Operational counterparty for settlement approvals",
        },
      ],
      settlement: {
        agreementHash: pool.poolId,
        contractAddress: pool.contractAddress,
        releaseTxHash: pool.releaseTxHash,
        transcriptHash: pool.poolId,
        released: pool.latestStatus === "completed",
        escrowBnb: Number(initialBalanceBnb.toFixed(4)),
        agentAApprovalTxHash: pool.agentAApprovalTxHash,
        agentAApprovalBlockNumber: pool.agentAApprovalBlockNumber,
        agentBApprovalTxHash: pool.agentBApprovalTxHash,
        agentBApprovalBlockNumber: pool.agentBApprovalBlockNumber,
        agentBApprovalActor: pool.agentBApprovalActor,
      },
      timeline: [
        {
          id: `${shortId}-created`,
          at: "recent",
          title: "Pool observed on-chain",
          detail: `Status: ${pool.lastStatusRaw}`,
          status: "ok" as const,
        },
      ],
    } satisfies PoolItem;
  });

  return pools;
}

async function loadLocalPoolsFromStateFile(): Promise<PoolItem[]> {
  const stateFile = process.env.AGENT_STATE_FILE || "/tmp/adm-agent-state.json";

  let raw = "";
  try {
    raw = await fsReadFile(stateFile, "utf8");
  } catch {
    return [];
  }

  const parsed = (() => {
    try {
      return JSON.parse(raw) as {
        agreements?: RuntimeStateAgreement[];
        rfqRequests?: RuntimeStateRfq[];
      };
    } catch {
      return { agreements: [], rfqRequests: [] };
    }
  })();

  const agreements = (parsed.agreements || []).slice().reverse();
  const rfqRequests = parsed.rfqRequests || [];
  if (agreements.length === 0) return [];

  return agreements
    .filter((agreement) => !!agreement.contractAddress)
    .map((agreement, index) => {
      const contractAddress = String(agreement.contractAddress || "");
      const deployTxHash = agreement.deployTxHash
        ? String(agreement.deployTxHash)
        : "";
      const releaseTxHash = String(agreement.releaseTxHash || "");
      const approvals = agreement.approvals || [];

      const status: PoolStatus = releaseTxHash
        ? "completed"
        : approvals.length >= 1
          ? "settling"
          : "live";

      const progress = progressFromStatus(status);
      const shortId = (agreement.agreementId || contractAddress).slice(0, 10);

      // Prefer new shape (meta.winner/meta.bids), fall back to legacy meta.rfq.selected
      const winner = agreement.meta?.winner;
      const legacySelected = agreement.meta?.rfq?.selected;
      const selectedName =
        winner?.displayName || legacySelected?.displayName || "Counterparty";
      const selectedQuoteBnb = Number(
        winner?.quoteBnb ?? legacySelected?.quoteBnb ?? 0,
      );
      const selectedEtaMinutes = Number(
        winner?.etaMinutes ?? legacySelected?.etaMinutes ?? 0,
      );
      const selectedReasoning = winner?.reasoning || "Selected by RFQ scoring";

      // Look up matching RFQ for richer metadata
      const linkedRfq = rfqRequests.find(
        (r) => r.agreementId === agreement.agreementId,
      );
      const objective = linkedRfq?.objective;
      const capabilityLabel =
        linkedRfq?.capability ||
        (agreement.meta?.bids || [])[0]?.agentId ||
        "rfq";

      const agentA = String(agreement.agentA || "");
      const agentB = String(agreement.agentB || "");
      const agentALower = agentA.toLowerCase();
      const agentBLower = agentB.toLowerCase();
      const approveTxHashes = agreement.approveTxHashes || {};

      // Build timeline from actual RFQ + approvals + release
      const timeline: TimelineEvent[] = [];
      if (linkedRfq) {
        timeline.push({
          id: `${shortId}-rfq-posted`,
          at: linkedRfq.postedAt || agreement.createdAt || "recent",
          title: "RFQ posted",
          detail: `${linkedRfq.capability || "task"} — budget ≤${linkedRfq.budgetBnb ?? "?"} BNB, ETA ≤${linkedRfq.maxEtaMinutes ?? "?"}m`,
          status: "info",
        });
        for (const bid of linkedRfq.bids || []) {
          timeline.push({
            id: `${shortId}-bid-${bid.bidId || bid.agentId}`,
            at: bid.submittedAt || "recent",
            title: `${bid.agentDisplayName || bid.agentId || "Bidder"} submitted bid`,
            detail: `${bid.quoteBnb ?? "?"} BNB · ETA ${bid.etaMinutes ?? "?"}m — ${bid.rationale || ""}`,
            status: "info",
          });
        }
        if (linkedRfq.selection) {
          timeline.push({
            id: `${shortId}-selection`,
            at: linkedRfq.selection.decidedAt || "recent",
            title: "Winner selected",
            detail: `${selectedName} — ${linkedRfq.selection.reasoning || selectedReasoning}`,
            status: "ok",
          });
        }
      }
      timeline.push({
        id: `${shortId}-escrow-deployed`,
        at: agreement.createdAt || "recent",
        title: "Escrow deployed",
        detail: deployTxHash
          ? `Contract ${contractAddress} · ${selectedQuoteBnb} BNB locked · tx ${deployTxHash.slice(0, 14)}…`
          : `Contract ${contractAddress} · ${selectedQuoteBnb} BNB locked`,
        status: "ok",
      });
      for (const [addr, tx] of Object.entries(approveTxHashes)) {
        const who =
          addr.toLowerCase() === agentALower
            ? "Agent A"
            : addr.toLowerCase() === agentBLower
              ? selectedName
              : addr.slice(0, 10);
        timeline.push({
          id: `${shortId}-approve-${addr}`,
          at: "recent",
          title: `${who} approved`,
          detail: `tx ${String(tx).slice(0, 14)}…`,
          status: "ok",
        });
      }
      if (releaseTxHash) {
        timeline.push({
          id: `${shortId}-released`,
          at: "recent",
          title: "Escrow released",
          detail: `release tx ${releaseTxHash.slice(0, 14)}…`,
          status: "ok",
        });
      }

      // ranked candidates from all bids
      const rankedCandidates = (linkedRfq?.bids || [])
        .slice()
        .sort((a, b) => (a.quoteBnb ?? 0) - (b.quoteBnb ?? 0))
        .map((bid, i) => ({
          rank: i + 1,
          agent: bid.agentDisplayName || bid.agentId || "candidate",
          score: Number(legacySelected?.score || 88),
          quoteBnb: Number(bid.quoteBnb ?? 0),
          etaMinutes: Number(bid.etaMinutes ?? 0),
          rationale: bid.rationale || "",
        }));

      const poolName = objective
        ? `Negotiated: ${objective.length > 70 ? objective.slice(0, 67) + "..." : objective}`
        : `Agreement ${agreement.agreementId || shortId}`;

      return {
        id: `state-${index + 1}-${shortId}`,
        name: poolName,
        status,
        strategy: objective
          ? "RFQ-driven agreement from local runtime"
          : "State-file projection for local/testnet runtime",
        network: process.env.DARK_MATTER_NETWORK || "bsc-testnet",
        capability: String(capabilityLabel),
        updatedAt: agreement.createdAt || new Date().toISOString(),
        progress,
        discoveredAgents: [
          {
            agentId: index * 2 + 1,
            name: "Agent A",
            wallet: agentA || "0x0000000000000000000000000000000000000000",
            capabilities: ["coordinator", "treasury"],
            fitScore: 90,
          },
          {
            agentId: index * 2 + 2,
            name: selectedName,
            wallet: agentB || "0x0000000000000000000000000000000000000000",
            capabilities: (linkedRfq?.bids || []).find(
              (b) => b.agentAddress?.toLowerCase() === agentBLower,
            )?.capabilities || ["executor"],
            fitScore: 88,
          },
        ],
        rankedCandidates:
          rankedCandidates.length > 0
            ? rankedCandidates
            : [
                {
                  rank: 1,
                  agent: selectedName,
                  score: Number(legacySelected?.score || 88),
                  quoteBnb: selectedQuoteBnb,
                  etaMinutes: selectedEtaMinutes,
                  rationale: selectedReasoning,
                },
              ],
        settlement: {
          agreementHash: String(
            agreement.meta?.agreementHash || agreement.agreementId || "",
          ),
          contractAddress,
          deploymentTxHash: deployTxHash || undefined,
          deploymentBlockNumber:
            typeof agreement.deployBlockNumber === "number"
              ? agreement.deployBlockNumber
              : undefined,
          releaseTxHash,
          transcriptHash: String(agreement.meta?.transcriptHash || ""),
          released: !!releaseTxHash,
          escrowBnb: selectedQuoteBnb,
          agentAApprovalTxHash: approveTxHashes[agentALower] || "",
          agentBApprovalTxHash: approveTxHashes[agentBLower] || "",
          agentAApprovalBlockNumber: 0,
          agentBApprovalBlockNumber: 0,
          agentBApprovalActor: agentBLower,
        },
        timeline,
      } satisfies PoolItem;
    });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestSource = params.get("source");
  const isLive = params.get("live") === "1";
  const parsedSinceCursor = Number.parseInt(params.get("since") || "0", 10);
  const sinceCursor = Number.isFinite(parsedSinceCursor)
    ? parsedSinceCursor
    : 0;
  const source = resolvePoolSource(requestSource);

  let pools = poolsForSource(source);
  if (source === "local") {
    const localSourcePreference = (
      process.env.DARK_MATTER_LOCAL_SOURCE || "state"
    ).toLowerCase();

    const [statePools, onChainPools] = await Promise.all([
      loadLocalPoolsFromStateFile(),
      loadLocalPoolsFromChain().catch(() => []),
    ]);

    if (localSourcePreference === "chain") {
      pools = onChainPools.length > 0 ? onChainPools : statePools;
    } else {
      pools = statePools.length > 0 ? statePools : onChainPools;
    }

    if (pools.length > 0) {
      const chatTimeline = await loadChatTimelineEvents();
      const rfqTimeline = await loadRfqTimelineEvents();
      const systemTimeline = await loadSystemTimelineEvents();
      const hasRichStateTimeline = (pools[0].timeline?.length || 0) >= 3;
      // If the state-file timeline already has real content (new RFQ flow),
      // don't merge in the legacy chat/rfq transcripts or override the name.
      if (hasRichStateTimeline) {
        // Append only operator-action events from system timeline (still useful)
        const operatorOnly = systemTimeline.filter(
          (e) => e.actionResponse !== undefined,
        );
        if (operatorOnly.length > 0) {
          pools[0] = {
            ...pools[0],
            timeline: [...pools[0].timeline, ...operatorOnly],
          };
        }
      } else if (
        chatTimeline.length > 0 ||
        rfqTimeline.length > 0 ||
        systemTimeline.length > 0
      ) {
        const negotiatedTitle = negotiatedPoolTitleFromTimeline(chatTimeline);
        pools[0] = {
          ...pools[0],
          name: negotiatedTitle || pools[0].name,
          strategy: negotiatedTitle
            ? "Title set by negotiation transcript proposal"
            : pools[0].strategy,
          timeline: [
            ...chatTimeline,
            ...rfqTimeline,
            ...systemTimeline,
            ...pools[0].timeline,
          ],
        };
      }
    }
  }

  const payload: PoolsResponse = {
    ok: true,
    source,
    generatedAt: new Date().toISOString(),
    selectedPoolId: pools[0]?.id || "",
    pools,
  };

  if (isLive) {
    return NextResponse.json(buildLiveTimeline(pools, source, sinceCursor));
  }

  return NextResponse.json(payload);
}
