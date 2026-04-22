"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AgentLogsPanel from "./AgentLogsPanel";

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

function statusLabel(status: PoolStatus): string {
  if (status === "live") return "Live";
  if (status === "settling") return "Settling";
  if (status === "completed") return "Completed";
  return "Watchlist";
}

function statusClasses(status: PoolStatus): string {
  if (status === "live") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  if (status === "settling") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  if (status === "completed") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  return "bg-surface-100 text-surface-600 border-surface-200";
}

function timelineBadge(status: TimelineStatus): string {
  if (status === "ok")
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "warn") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function shorten(value: string, width = 7): string {
  if (value.length <= width * 2) return value;
  return `${value.slice(0, width)}...${value.slice(-width)}`;
}

function txLink(hash: string): string {
  return `https://testnet.bscscan.com/tx/${hash}`;
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function sourceBadge(source: PoolsResponse["source"] | undefined): string {
  if (source === "local") return "local chain";
  if (source === "prod") return "prod preview";
  return "mock";
}

function formatLocalDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionLabel(action: OperatorActionType): string {
  if (action === "retry-step") return "Retry step";
  if (action === "force-reveal-public-summary") return "Reveal public summary";
  return "Escalate dispute";
}

function hashValue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function agentInitials(name: string): string {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  if (pieces.length === 0) return "AG";
  if (pieces.length === 1) return pieces[0].slice(0, 2).toUpperCase();
  return `${pieces[0][0]}${pieces[1][0]}`.toUpperCase();
}

function agentRoleBadge(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("agent a")) return "A";
  if (normalized.includes("agent b")) return "B";
  if (normalized.includes("orchestrator")) return "OR";
  return "AG";
}

function avatarStyle(name: string, wallet: string) {
  const seed = hashValue(`${name}:${wallet}`);
  const hueA = seed % 360;
  const hueB = (seed * 7) % 360;
  const angle = seed % 180;

  return {
    backgroundImage: `linear-gradient(${angle}deg, hsl(${hueA} 70% 56%), hsl(${hueB} 72% 46%))`,
  };
}

function actionsForEvent(event: TimelineEvent): OperatorActionType[] {
  if (event.actionAllowed && event.actionAllowed.length > 0) {
    return event.actionAllowed;
  }

  if (event.title.toLowerCase().includes("hidden agent-only")) {
    return ["force-reveal-public-summary"];
  }

  if (event.status === "warn") {
    return ["retry-step", "escalate-dispute"];
  }

  return [];
}

function timelineActor(event: TimelineEvent): string {
  const title = event.title.trim();
  const lower = title.toLowerCase();

  if (lower.endsWith(" chat")) {
    return title.replace(/\s+chat$/i, "").trim() || "Agent";
  }
  if (lower.includes("operator")) return "Operator";
  if (lower.includes("orchestrator")) return "Orchestrator";
  if (
    lower.includes("pool observed") ||
    lower.includes("action graph") ||
    lower.includes("settlement") ||
    lower.includes("release")
  ) {
    return "Chain";
  }
  return "System";
}

function poolSummary(pool: PoolItem): {
  headline: string;
  detail: string;
  objective: string;
} {
  const proposalLine = pool.timeline.find((event) => {
    const detail = event.detail.toLowerCase();
    return detail.includes("proposal") || detail.includes("objective");
  })?.detail;

  const proposalObjective = proposalLine
    ? proposalLine.replace(/^proposal\s*:\s*/i, "").trim()
    : "";

  const objective =
    proposalObjective || `${pool.strategy} with focus on ${pool.capability}`;

  const approvals = [
    !!pool.settlement.agentAApprovalTxHash,
    !!pool.settlement.agentBApprovalTxHash,
  ].filter(Boolean).length;

  if (pool.settlement.released) {
    return {
      headline: "Settlement complete",
      detail:
        "Both agents approved and escrow has been released. Evidence is available in approval and release transactions.",
      objective,
    };
  }

  if (approvals >= 2) {
    return {
      headline: "Awaiting release finalization",
      detail:
        "Both approvals are present on-chain. Coordinator release is the remaining step to close settlement.",
      objective,
    };
  }

  if (approvals === 1) {
    return {
      headline: "In active negotiation/approval",
      detail:
        "One counterparty has approved so far. Waiting for the second approval before release can execute.",
      objective,
    };
  }

  return {
    headline: "Negotiation phase",
    detail:
      "Agents are still aligning terms. Pool title and timeline will update as proposal and approval events arrive.",
    objective,
  };
}

export default function Page() {
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string>("");
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [visibleTimelineCards, setVisibleTimelineCards] = useState<
    Record<string, boolean>
  >({});
  const [showOperator, setShowOperator] = useState(false);
  const timelineCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setShowOperator(params.get("operator") === "1");
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/session?source=local", {
          cache: "no-store",
        });
        const payload = (await response.json()) as PoolsResponse;
        if (!mounted) return;

        setData(payload);
        setSelectedPoolId((current) => {
          if (current && payload.pools.some((pool) => pool.id === current)) {
            return current;
          }
          return payload.selectedPoolId || payload.pools[0]?.id || null;
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const pools = data?.pools ?? [];

  const filteredPools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pools;

    return pools.filter((pool) => {
      const poolText = [
        pool.name,
        pool.strategy,
        pool.capability,
        pool.network,
        pool.id,
      ]
        .join(" ")
        .toLowerCase();

      const discoveredText = pool.discoveredAgents
        .flatMap((agent) => [
          agent.name,
          agent.wallet,
          ...agent.capabilities,
          String(agent.agentId),
        ])
        .join(" ")
        .toLowerCase();

      const rankedText = pool.rankedCandidates
        .flatMap((candidate) => [candidate.agent, candidate.rationale])
        .join(" ")
        .toLowerCase();

      return (
        poolText.includes(query) ||
        discoveredText.includes(query) ||
        rankedText.includes(query)
      );
    });
  }, [pools, searchQuery]);

  const activePool = useMemo(() => {
    if (filteredPools.length === 0) return null;
    return (
      filteredPools.find((pool) => pool.id === selectedPoolId) ||
      filteredPools[0]
    );
  }, [filteredPools, selectedPoolId]);

  const activePoolSummary = useMemo(() => {
    if (!activePool) return null;
    return poolSummary(activePool);
  }, [activePool]);

  useEffect(() => {
    if (!activePool) return;
    // Animate cards in once per pool, without scroll gating. This keeps the
    // staggered CSS reveal on first render and prevents re-animation when
    // the user scrolls the timeline back into view.
    const next: Record<string, boolean> = {};
    activePool.timeline.forEach((event) => {
      next[`${activePool.id}-${event.id}`] = true;
    });
    setVisibleTimelineCards(next);
  }, [activePool]);

  const runOperatorAction = async (
    poolId: string,
    action: OperatorActionType,
    stepId?: string,
    contractAddress?: string,
  ) => {
    setActionPendingId(`${poolId}-${action}-${stepId || "latest"}`);
    setActionFeedback("");

    try {
      const response = await fetch("/api/session/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ poolId, action, stepId, contractAddress }),
      });

      const result = (await response.json()) as OperatorActionResponse;
      const suffix = result.summary ? ` Summary: ${result.summary}` : "";
      const onChainSuffix = result.onChainTxHash
        ? ` On-chain tx: ${shorten(result.onChainTxHash, 10)}`
        : "";
      setActionFeedback(`${result.detail}${suffix}${onChainSuffix}`);
    } catch {
      setActionFeedback("Operator action failed to submit.");
    } finally {
      setActionPendingId(null);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 xl:w-[82vw]">
        <nav className="panel flex flex-wrap items-center justify-between gap-3 p-3 md:p-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-surface-300 bg-white px-3 py-1.5 text-sm font-semibold text-surface-800 transition hover:-translate-y-0.5"
            >
              Home
            </Link>
            <Link
              href="/docs"
              className="rounded-full border border-surface-300 bg-white px-3 py-1.5 text-sm font-semibold text-surface-800 transition hover:-translate-y-0.5"
            >
              Docs
            </Link>
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-medium text-brand-700">
            Dashboard · live session view
          </span>
        </nav>

        <HeroStrip
          data={data}
          activePool={activePool}
          activeSummary={activePoolSummary}
          isLoading={isLoading}
        />

        {activePool && (
          <>
            <AgentDealRow pool={activePool} />

            <details className="panel p-5 md:p-6">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Other agreements &amp; pools</p>
                  <p className="mt-1 text-sm text-surface-600">
                    Browse additional pools and switch the demo view.
                  </p>
                </div>
                <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-[11px] text-surface-600">
                  {filteredPools.length}/{pools.length}{" "}
                  {sourceBadge(data?.source)}
                </span>
              </summary>

              <div className="mt-4 space-y-3">
                <input
                  id="pool-agent-search"
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by pool name, strategy, agent, or wallet"
                  className="h-[44px] w-full rounded-xl border border-surface-200 bg-white px-3 text-sm text-surface-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                />

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredPools.map((pool) => {
                    const active = pool.id === activePool?.id;
                    return (
                      <button
                        key={pool.id}
                        type="button"
                        onClick={() => setSelectedPoolId(pool.id)}
                        className={[
                          "rounded-xl border p-3 text-left transition",
                          active
                            ? "border-brand-300 bg-brand-50"
                            : "border-surface-200 bg-white hover:border-brand-200 hover:bg-brand-50/40",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-surface-900">
                            {pool.name}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(pool.status)}`}
                          >
                            {statusLabel(pool.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-surface-500">
                          {pool.network}
                        </p>
                        <p className="mt-2 text-xs text-surface-600 line-clamp-2">
                          {pool.strategy}
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-200">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${pool.progress}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-surface-500">
                          <span>{pool.progress}% complete</span>
                          <span>{formatLocalDateTime(pool.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredPools.length === 0 && (
                    <div className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm text-surface-600">
                      No pools or agents matched your search.
                    </div>
                  )}
                </div>
              </div>
            </details>

            <RfqAuctionPanel pool={activePool} />

            <ProofRibbon pool={activePool} />

            <details className="panel p-5 md:p-6 open:shadow-card" open>
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Transcript &amp; timeline</p>
                  <p className="mt-1 text-sm text-surface-600">
                    Step-by-step record of discovery, negotiation, and on-chain
                    settlement.
                  </p>
                </div>
                <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-[11px] text-surface-600">
                  {activePool.timeline.length} events
                </span>
              </summary>

              {actionFeedback && (
                <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
                  {actionFeedback}
                </div>
              )}

              <TimelineColumn
                pool={activePool}
                visibleTimelineCards={visibleTimelineCards}
                timelineCardRefs={timelineCardRefs}
                showOperator={showOperator}
                runOperatorAction={runOperatorAction}
                actionPendingId={actionPendingId}
              />
            </details>
          </>
        )}

        {!activePool && !isLoading && (
          <div className="panel p-6 text-sm text-surface-600">
            No active agreement yet. Run the orchestrator to produce a settled
            pool.
          </div>
        )}

        <footer className="text-center text-[11px] text-surface-500">
          Agentic Dark Matter · agent-to-agent settlement on BNB Chain · testnet
          demo
        </footer>
      </section>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

function HeroStrip({
  data,
  activePool,
  activeSummary,
  isLoading,
}: {
  data: PoolsResponse | null;
  activePool: PoolItem | null;
  activeSummary: { headline: string; detail: string; objective: string } | null;
  isLoading: boolean;
}) {
  const network = activePool?.network || "bsc-testnet";
  const chip =
    data?.source === "local"
      ? "Live · state file"
      : data?.source === "prod"
        ? "Live · prod"
        : "Mock data";

  return (
    <header className="panel hero-glow relative overflow-hidden p-6 md:p-8">
      <div className="relative z-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Agentic Dark Matter</span>
          <span className="live-chip">
            <span className="live-chip-dot" />
            {chip}
          </span>
          <span className="rounded-full border border-surface-200 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-surface-600">
            {network}
          </span>
        </div>

        <h1 className="mt-3 max-w-3xl text-2xl font-semibold text-surface-900 md:text-3xl">
          Autonomous agents negotiating and settling trust on-chain.
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-surface-600 md:text-base">
          Two agents discover each other, run an RFQ auction to price the work,
          deploy an escrow, exchange approvals, and release funds — end-to-end,
          with BscScan proof for every step.
        </p>

        {isLoading && !activePool && (
          <div className="mt-6 rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-surface-500">
            Loading latest agreement…
          </div>
        )}

        {activePool && (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr,1fr]">
            <div className="rounded-xl border border-brand-200 bg-white/80 p-4 shadow-sm backdrop-blur">
              <p className="metric-label">Latest agreement</p>
              <p className="mt-1 text-base font-semibold text-surface-900">
                {activePool.name}
              </p>
              {activeSummary && (
                <p className="mt-1 text-xs text-surface-600">
                  {activeSummary.headline} · {activeSummary.objective}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-2 py-0.5 font-medium ${statusClasses(activePool.status)}`}
                >
                  {statusLabel(activePool.status)}
                </span>
                <CopyChip
                  label="Contract"
                  value={activePool.settlement.contractAddress}
                />
                <a
                  href={addressLink(activePool.settlement.contractAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-brand-300 bg-brand-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-600"
                >
                  Open on BscScan →
                </a>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <HeroStat
                label="Escrow"
                value={`${activePool.settlement.escrowBnb} BNB`}
              />
              <HeroStat
                label="Approvals"
                value={`${
                  [
                    activePool.settlement.agentAApprovalTxHash,
                    activePool.settlement.agentBApprovalTxHash,
                  ].filter(Boolean).length
                } / 2`}
              />
              <HeroStat
                label="Released"
                value={activePool.settlement.released ? "Yes" : "Pending"}
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white/80 p-3 text-center backdrop-blur">
      <p className="metric-label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-surface-900">{value}</p>
    </div>
  );
}

function AgentDealRow({ pool }: { pool: PoolItem }) {
  const agentA = findAgent(pool, "agent a");
  const agentB = findAgent(pool, "agent b");

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <AgentCard agent={agentA} label="Agent A" fallbackRole="A" />
      <AgentCard agent={agentB} label="Agent B" fallbackRole="B" />
      <DealCard pool={pool} />
    </section>
  );
}

function AgentCard({
  agent,
  label,
  fallbackRole,
}: {
  agent: DiscoveryAgent | undefined;
  label: string;
  fallbackRole: string;
}) {
  if (!agent) {
    return (
      <article className="panel p-5">
        <p className="eyebrow">{label}</p>
        <p className="mt-2 text-sm text-surface-600">Not yet discovered.</p>
      </article>
    );
  }

  return (
    <article className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700">
          Fit {agent.fitScore}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={avatarStyle(agent.name, agent.wallet)}
        >
          {agentInitials(agent.name)}
          <span className="absolute -bottom-1 -right-1 rounded-full border border-white bg-black/80 px-1 text-[9px] font-bold leading-4 text-white">
            {agentRoleBadge(agent.name) || fallbackRole}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-surface-900">
            {agent.name}
          </p>
          <p className="text-xs text-surface-500">Agent #{agent.agentId}</p>
        </div>
      </div>
      <div className="mt-3">
        <CopyChip label="Wallet" value={agent.wallet} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {agent.capabilities.map((item) => (
          <span
            key={`${agent.agentId}-${item}`}
            className="rounded-full border border-surface-200 bg-surface-50 px-2 py-1 text-[11px] text-surface-600"
          >
            {item}
          </span>
        ))}
      </div>
    </article>
  );
}

function DealCard({ pool }: { pool: PoolItem }) {
  return (
    <article className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Deal</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(pool.status)}`}
        >
          {statusLabel(pool.status)}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-surface-900">
        {pool.capability}
      </p>
      <p className="mt-1 text-xs text-surface-600">{pool.strategy}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-2">
          <p className="metric-label">Escrow</p>
          <p className="mt-0.5 text-sm font-semibold text-surface-900">
            {pool.settlement.escrowBnb} BNB
          </p>
        </div>
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-2">
          <p className="metric-label">Discovered</p>
          <p className="mt-0.5 text-sm font-semibold text-surface-900">
            {pool.discoveredAgents.length} agents
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <CopyChip
          label="Agreement"
          value={pool.settlement.agreementHash}
          full
        />
        <CopyChip
          label="Transcript"
          value={pool.settlement.transcriptHash}
          full
        />
      </div>
    </article>
  );
}

function RfqAuctionPanel({ pool }: { pool: PoolItem }) {
  const ranked = [...pool.rankedCandidates].sort((a, b) => a.rank - b.rank);
  if (ranked.length === 0) return null;
  const winner = ranked[0];
  const maxScore = Math.max(...ranked.map((c) => c.score), 1);

  return (
    <article className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Step 2 · RFQ auction</p>
          <h2 className="mt-1 text-lg font-semibold text-surface-900">
            Competitive quoting
          </h2>
        </div>
        <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-[11px] text-surface-600">
          {ranked.length} bids scored
        </span>
      </div>

      <div className="winner-chip mt-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Winner
          </span>
          <p className="text-sm font-semibold">
            {winner.agent} · score {winner.score} · {winner.quoteBnb} BNB ·{" "}
            {winner.etaMinutes}m ETA
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {ranked.map((candidate, index) => {
          const linked = pool.discoveredAgents.find(
            (a) => a.name === candidate.agent,
          );
          const wallet = linked?.wallet || candidate.agent;
          const pct = Math.round((candidate.score / maxScore) * 100);
          const isWinner = index === 0;

          return (
            <div
              key={`${pool.id}-${candidate.rank}`}
              className={`rounded-xl border p-3 transition ${
                isWinner
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-surface-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="relative flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={avatarStyle(candidate.agent, wallet)}
                  >
                    {agentInitials(candidate.agent)}
                    <span className="absolute -bottom-1 -right-1 rounded-full border border-white bg-black/75 px-1 text-[8px] font-bold leading-4 text-white">
                      {agentRoleBadge(candidate.agent)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-900">
                      #{candidate.rank} {candidate.agent}
                    </p>
                    <p className="text-[11px] text-surface-500">
                      {candidate.quoteBnb} BNB · {candidate.etaMinutes}m ETA
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-surface-900">
                  {candidate.score}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-200">
                <div
                  className={`h-full rounded-full ${isWinner ? "rfq-bar-winner" : "rfq-bar"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-surface-600">
                {candidate.rationale}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-surface-500">
        Scoring weights · price 35% · ETA 20% · reliability 25% · capability fit
        20%. Ties broken by score → ETA → price → id.
      </p>
    </article>
  );
}

function ProofRibbon({ pool }: { pool: PoolItem }) {
  const stops: Array<{
    label: string;
    hash?: string;
    kind: "address" | "tx";
  }> = [
    {
      label: "Escrow deployed",
      hash: pool.settlement.contractAddress,
      kind: "address",
    },
    {
      label: "Agent A approved",
      hash: pool.settlement.agentAApprovalTxHash,
      kind: "tx",
    },
    {
      label: "Agent B approved",
      hash: pool.settlement.agentBApprovalTxHash,
      kind: "tx",
    },
    {
      label: "Escrow released",
      hash: pool.settlement.releaseTxHash,
      kind: "tx",
    },
  ];

  return (
    <article className="panel p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Step 3 · On-chain settlement</p>
          <h2 className="mt-1 text-lg font-semibold text-surface-900">
            Every step has a BscScan receipt
          </h2>
        </div>
        <span className="rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-[11px] text-surface-600">
          {stops.filter((s) => s.hash).length}/{stops.length} complete
        </span>
      </div>

      <div className="proof-ribbon mt-5">
        {stops.map((stop, index) => {
          const done = !!stop.hash;
          const href = stop.hash
            ? stop.kind === "tx"
              ? txLink(stop.hash)
              : addressLink(stop.hash)
            : undefined;

          return (
            <div key={stop.label} className="proof-stop">
              <div
                className={`proof-dot ${done ? "proof-dot-done" : "proof-dot-pending"}`}
              >
                {done ? "✓" : index + 1}
              </div>
              <div className="mt-2 text-center">
                <p className="text-[11px] font-semibold text-surface-900">
                  {stop.label}
                </p>
                {done && href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-[11px] font-mono text-brand-700 underline"
                  >
                    {shorten(stop.hash!, 6)}
                  </a>
                ) : (
                  <p className="mt-1 text-[11px] text-surface-500">Pending</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function CopyChip({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-2.5 py-1 text-[11px] font-mono text-surface-700 transition hover:border-brand-300 hover:text-brand-700"
      title={value}
    >
      <span className="font-sans font-semibold text-surface-500">{label}</span>
      <span>{full ? shorten(value, 8) : shorten(value, 6)}</span>
      <span className="text-[10px] text-surface-400">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

function TimelineColumn({
  pool,
  visibleTimelineCards,
  timelineCardRefs,
  showOperator,
  runOperatorAction,
  actionPendingId,
}: {
  pool: PoolItem;
  visibleTimelineCards: Record<string, boolean>;
  timelineCardRefs: React.MutableRefObject<
    Record<string, HTMLDivElement | null>
  >;
  showOperator: boolean;
  runOperatorAction: (
    poolId: string,
    action: OperatorActionType,
    stepId?: string,
    contractAddress?: string,
  ) => void;
  actionPendingId: string | null;
}) {
  return (
    <div className="relative mt-4">
      <div className="timeline-spine" aria-hidden="true" />

      <div className="space-y-4">
        {pool.timeline.map((event, index) => {
          const timelineId = `${pool.id}-${event.id}`;
          const actor = timelineActor(event);
          const linked = pool.discoveredAgents.find(
            (a) => a.name.toLowerCase() === actor.toLowerCase(),
          );
          const actorWallet =
            linked?.wallet || pool.settlement.contractAddress || actor;
          const actions = showOperator ? actionsForEvent(event) : [];
          const isVisible = !!visibleTimelineCards[timelineId];
          const alignLeft = index % 2 === 0;

          return (
            <div
              key={timelineId}
              className={[
                "relative lg:min-h-[1px]",
                alignLeft ? "lg:pr-[52%]" : "lg:pl-[52%]",
              ].join(" ")}
            >
              <div className="timeline-node" aria-hidden="true" />

              <div
                ref={(node) => {
                  timelineCardRefs.current[timelineId] = node;
                }}
                data-timeline-id={timelineId}
                className={[
                  "timeline-card rounded-xl border border-surface-200 bg-white p-3 shadow-sm",
                  alignLeft ? "timeline-card-left" : "timeline-card-right",
                  isVisible ? "timeline-card-visible" : "",
                ].join(" ")}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="relative flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={avatarStyle(actor, actorWallet)}
                    >
                      {agentInitials(actor)}
                      <span className="absolute -bottom-1 -right-1 rounded-full border border-white bg-black/75 px-1 text-[8px] font-bold leading-4 text-white">
                        {agentRoleBadge(actor)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${timelineBadge(event.status)}`}
                    >
                      {event.status.toUpperCase()}
                    </span>
                    <p className="text-sm font-semibold text-surface-900">
                      {event.title}
                    </p>
                  </div>
                  <span className="text-xs text-surface-500">
                    {formatLocalDateTime(event.at)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-surface-600">{event.detail}</p>

                {(event.actionGraphHash || event.actionGraphStorageRef) && (
                  <div className="mt-2 rounded border border-surface-200 bg-surface-50 px-2 py-1 text-[11px] text-surface-600">
                    {event.actionGraphHash && (
                      <p>Graph hash: {shorten(event.actionGraphHash, 10)}</p>
                    )}
                    {event.actionGraphStorageRef && (
                      <p>Graph ref: {event.actionGraphStorageRef}</p>
                    )}
                  </div>
                )}

                {event.actionResponse && (
                  <div className="mt-2 rounded border border-surface-200 bg-surface-50 px-2 py-1 text-[11px] text-surface-600">
                    <p>
                      Operator action: {event.actionResponse.action} (
                      {event.actionResponse.status})
                    </p>
                    {event.actionResponse.summary && (
                      <p className="mt-1">{event.actionResponse.summary}</p>
                    )}
                  </div>
                )}

                {actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {actions.map((action) => {
                      const actionId = `${pool.id}-${action}-${event.id}`;
                      return (
                        <button
                          key={actionId}
                          type="button"
                          onClick={() =>
                            runOperatorAction(
                              pool.id,
                              action,
                              event.id,
                              pool.settlement.contractAddress,
                            )
                          }
                          disabled={actionPendingId === actionId}
                          className="rounded-md border border-surface-300 bg-white px-2 py-1 text-[11px] font-medium text-surface-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
                        >
                          {actionPendingId === actionId
                            ? "Submitting…"
                            : actionLabel(action)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function addressLink(addr: string): string {
  return `https://testnet.bscscan.com/address/${addr}`;
}

function findAgent(
  pool: PoolItem,
  nameLower: string,
): DiscoveryAgent | undefined {
  return pool.discoveredAgents.find((a) => a.name.toLowerCase() === nameLower);
}
