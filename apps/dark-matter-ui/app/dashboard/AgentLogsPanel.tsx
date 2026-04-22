"use client";

import { useEffect, useRef, useState } from "react";

interface LogLine {
  at: string;
  scope: string;
  message: string;
}

const SCOPE_COLORS: Record<string, string> = {
  "agent-a": "text-cyan-700 bg-cyan-50 border-cyan-200",
  "agent-b": "text-amber-700 bg-amber-50 border-amber-200",
  "agent-c": "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200",
  orchestrator: "text-emerald-700 bg-emerald-50 border-emerald-200",
  anvil: "text-slate-600 bg-slate-50 border-slate-200",
};

function scopeClass(scope: string): string {
  return SCOPE_COLORS[scope] || "text-slate-700 bg-slate-50 border-slate-200";
}

export default function AgentLogsPanel() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [exists, setExists] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSeenRef = useRef<string>("");

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (mounted && !paused) {
        try {
          const qs = lastSeenRef.current
            ? `?limit=1000&since=${encodeURIComponent(lastSeenRef.current)}`
            : `?limit=500`;
          const res = await fetch(`/api/logs${qs}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as {
              lines: LogLine[];
              exists: boolean;
            };
            setExists(body.exists);
            if (body.lines.length > 0) {
              setLines((prev) => {
                const next = lastSeenRef.current
                  ? [...prev, ...body.lines]
                  : body.lines;
                // keep max 1000 in memory
                return next.length > 1000 ? next.slice(-1000) : next;
              });
              lastSeenRef.current = body.lines[body.lines.length - 1].at;
            }
          }
        } catch {
          // transient, ignore
        }
      }
      if (mounted) timer = setTimeout(tick, 1500);
    };

    tick();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [paused]);

  // Auto-scroll to bottom on new lines (unless user scrolled up).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const filterLower = filter.trim().toLowerCase();
  const shown = filterLower
    ? lines.filter(
        (l) =>
          l.scope.toLowerCase().includes(filterLower) ||
          l.message.toLowerCase().includes(filterLower),
      )
    : lines;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Agent logs</p>
          <h3 className="text-lg font-semibold text-surface-900">
            Live runtime stream
          </h3>
          <p className="mt-1 text-xs text-surface-500">
            Tailing{" "}
            <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px]">
              /tmp/adm-agent-logs.jsonl
            </code>{" "}
            {exists === false && (
              <span className="text-amber-600">
                (no logs yet — start agents via{" "}
                <code className="rounded bg-amber-50 px-1 py-0.5">
                  npm run demo:up
                </code>
                )
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="w-40 rounded-md border border-surface-200 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              paused
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-surface-300 bg-white text-surface-700 hover:border-brand-300"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => {
              setLines([]);
              lastSeenRef.current = "";
            }}
            className="rounded-md border border-surface-300 bg-white px-2 py-1 text-xs font-medium text-surface-700 hover:border-brand-300"
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={listRef}
        className="h-80 overflow-y-auto rounded-lg border border-surface-200 bg-[#0b1118] p-3 font-mono text-[11.5px] leading-relaxed"
      >
        {shown.length === 0 ? (
          <div className="text-slate-400">
            {exists === false
              ? "waiting for agents…"
              : filterLower
                ? "no lines match filter"
                : "no logs yet"}
          </div>
        ) : (
          shown.map((l, i) => {
            const ts = l.at.slice(11, 23); // HH:MM:SS.mmm
            return (
              <div
                key={`${l.at}-${i}`}
                className="flex items-start gap-2 py-0.5 text-slate-200"
              >
                <span className="shrink-0 text-slate-500">{ts}</span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${scopeClass(
                    l.scope,
                  )}`}
                >
                  {l.scope}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {l.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
