"use client";

import { useEffect, useMemo, useState } from "react";

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

function sourceBadge(source: PoolsResponse["source"] | undefined): string {
  if (source === "local") return "local chain";
  if (source === "prod") return "prod preview";
  return "mock";
}

function actionLabel(action: OperatorActionType): string {
  if (action === "retry-step") return "Retry step";
  if (action === "force-reveal-public-summary") return "Reveal public summary";
  return "Escalate dispute";
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

export default function Page() {
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string>("");
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
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

    return () => {
      mounted = false;
    };
  }, []);

  const pools = data?.pools ?? [];

  const activePool = useMemo(() => {
    if (pools.length === 0) return null;
    return pools.find((pool) => pool.id === selectedPoolId) ?? pools[0];
  }, [pools, selectedPoolId]);

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
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="panel p-6 md:p-7">
          <p className="eyebrow">Agentic Dark Matter</p>
          <h1 className="mt-2 text-2xl font-semibold text-surface-900 md:text-3xl">
            Pool Explorer
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-surface-600 md:text-base">
            Clean mock workspace to demo multiple pools, selectable details, and
            settlement snapshots without relying on live terminal data.
          </p>
          <div className="mt-5 grid gap-3 text-xs text-surface-600 md:grid-cols-3">
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
              <p className="metric-label">Total pools</p>
              <p className="mt-1 text-base font-semibold text-surface-900">
                {pools.length}
              </p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
              <p className="metric-label">Generated</p>
              <p className="mt-1 text-base font-semibold text-surface-900">
                {data?.generatedAt ?? "-"}
              </p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
              <p className="metric-label">Selected pool</p>
              <p className="mt-1 text-base font-semibold text-surface-900">
                {activePool?.name ?? "-"}
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <aside className="panel h-fit p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="eyebrow">Pools</p>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600">
                {pools.length} {sourceBadge(data?.source)}
              </span>
            </div>

            <div className="space-y-3">
              {isLoading && (
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm text-surface-500">
                  Loading pools...
                </div>
              )}

              {!isLoading &&
                pools.map((pool) => {
                  const active = pool.id === activePool?.id;

                  return (
                    <button
                      key={pool.id}
                      type="button"
                      onClick={() => setSelectedPoolId(pool.id)}
                      className={[
                        "w-full rounded-xl border p-3 text-left transition",
                        active
                          ? "border-brand-300 bg-brand-50"
                          : "border-surface-200 bg-white hover:border-brand-200 hover:bg-brand-50/40",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-surface-900">
                            {pool.name}
                          </p>
                          <p className="mt-1 text-xs text-surface-500">
                            {pool.network}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(pool.status)}`}
                        >
                          {statusLabel(pool.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-surface-600">
                        {pool.strategy}
                      </p>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-200">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${pool.progress}%` }}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-surface-500">
                        <span>{pool.progress}% complete</span>
                        <span>{pool.updatedAt}</span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </aside>

          <section className="panel p-5 md:p-6">
            {!activePool && (
              <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50 p-6 text-sm text-surface-600">
                No pool selected.
              </div>
            )}

            {activePool && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="eyebrow">Pool details</p>
                    <h2 className="mt-2 text-2xl font-semibold text-surface-900">
                      {activePool.name}
                    </h2>
                    <p className="mt-2 text-sm text-surface-600">
                      {activePool.strategy}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(activePool.status)}`}
                  >
                    {statusLabel(activePool.status)}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <p className="metric-label">Capability</p>
                    <p className="mt-1 text-sm font-semibold text-surface-900">
                      {activePool.capability}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <p className="metric-label">Discovered agents</p>
                    <p className="mt-1 text-sm font-semibold text-surface-900">
                      {activePool.discoveredAgents.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <p className="metric-label">Escrow value</p>
                    <p className="mt-1 text-sm font-semibold text-surface-900">
                      {activePool.settlement.escrowBnb} BNB
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <article className="rounded-xl border border-surface-200 p-4">
                    <p className="eyebrow">Discovery</p>
                    <div className="mt-3 space-y-3">
                      {activePool.discoveredAgents.map((agent) => (
                        <div
                          key={`${activePool.id}-${agent.agentId}`}
                          className="rounded-lg border border-surface-200 bg-surface-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-surface-900">
                                {agent.name}
                              </p>
                              <p className="text-xs text-surface-500">
                                Agent #{agent.agentId}
                              </p>
                            </div>
                            <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-medium text-brand-700">
                              Fit {agent.fitScore}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-surface-600">
                            Wallet {agent.wallet}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {agent.capabilities.map((item) => (
                              <span
                                key={`${agent.agentId}-${item}`}
                                className="rounded-full border border-surface-200 bg-white px-2 py-1 text-[11px] text-surface-600"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-xl border border-surface-200 p-4">
                    <p className="eyebrow">Matchmaking</p>
                    <div className="mt-3 space-y-3">
                      {activePool.rankedCandidates.map((candidate) => (
                        <div
                          key={`${activePool.id}-${candidate.rank}`}
                          className="rounded-lg border border-surface-200 bg-surface-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-surface-900">
                              #{candidate.rank} {candidate.agent}
                            </p>
                            <p className="text-xs font-medium text-surface-600">
                              Score {candidate.score}
                            </p>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-200">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${candidate.score}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-surface-600">
                            <span>{candidate.quoteBnb} BNB quote</span>
                            <span>{candidate.etaMinutes} min ETA</span>
                          </div>
                          <p className="mt-2 text-xs text-surface-600">
                            {candidate.rationale}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <article className="rounded-xl border border-surface-200 p-4">
                  <p className="eyebrow">Settlement</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                      <p className="metric-label">Agreement hash</p>
                      <p className="mt-1 break-all text-xs font-semibold text-surface-900">
                        {activePool.settlement.agreementHash}
                      </p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                      <p className="metric-label">Contract</p>
                      <p className="mt-1 break-all text-xs font-semibold text-surface-900">
                        {activePool.settlement.contractAddress}
                      </p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                      <p className="metric-label">Release tx</p>
                      {activePool.settlement.releaseTxHash ? (
                        <a
                          href={txLink(activePool.settlement.releaseTxHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-xs font-semibold text-brand-700 underline"
                        >
                          {shorten(activePool.settlement.releaseTxHash, 10)}
                        </a>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-surface-600">
                          Pending
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                      <p className="metric-label">Transcript commitment</p>
                      <p className="mt-1 break-all text-xs font-semibold text-surface-900">
                        {activePool.settlement.transcriptHash}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1 text-xs text-surface-700">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        activePool.settlement.released
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                    />
                    {activePool.settlement.released
                      ? "Escrow released"
                      : "Awaiting escrow release"}
                  </div>
                </article>

                <article className="rounded-xl border border-surface-200 p-4">
                  <p className="eyebrow">Timeline</p>
                  {actionFeedback && (
                    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
                      {actionFeedback}
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {activePool.timeline.map((event) => (
                      <div
                        key={`${activePool.id}-${event.id}`}
                        className="rounded-lg border border-surface-200 bg-surface-50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
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
                            {event.at}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-surface-600">
                          {event.detail}
                        </p>

                        {(event.actionGraphHash ||
                          event.actionGraphStorageRef) && (
                          <div className="mt-2 rounded border border-surface-200 bg-white px-2 py-1 text-[11px] text-surface-600">
                            {event.actionGraphHash && (
                              <p>
                                Graph hash: {shorten(event.actionGraphHash, 10)}
                              </p>
                            )}
                            {event.actionGraphStorageRef && (
                              <p>Graph ref: {event.actionGraphStorageRef}</p>
                            )}
                          </div>
                        )}

                        {event.actionResponse && (
                          <div className="mt-2 rounded border border-surface-200 bg-white px-2 py-1 text-[11px] text-surface-600">
                            <p>
                              Operator action: {event.actionResponse.action} (
                              {event.actionResponse.status})
                            </p>
                            {event.actionResponse.summary && (
                              <p className="mt-1">
                                {event.actionResponse.summary}
                              </p>
                            )}
                          </div>
                        )}

                        {actionsForEvent(event).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {actionsForEvent(event).map((action) => {
                              const actionId = `${activePool.id}-${action}-${event.id}`;
                              return (
                                <button
                                  key={actionId}
                                  type="button"
                                  onClick={() =>
                                    runOperatorAction(
                                      activePool.id,
                                      action,
                                      event.id,
                                      activePool.settlement.contractAddress,
                                    )
                                  }
                                  disabled={actionPendingId === actionId}
                                  className="rounded-md border border-surface-300 bg-white px-2 py-1 text-[11px] font-medium text-surface-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
                                >
                                  {actionPendingId === actionId
                                    ? "Submitting..."
                                    : actionLabel(action)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
