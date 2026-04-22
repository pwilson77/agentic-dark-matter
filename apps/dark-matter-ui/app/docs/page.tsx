import Link from "next/link";
import { Space_Grotesk, Fraunces } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "700"] });
const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const pillars = [
  {
    title: "Lifecycle core",
    text: "Canonical create/approve/release/timeout semantics exposed through shared MCP adapters.",
  },
  {
    title: "RFQ auction",
    text: "Deterministic scoring picks counterparties with weighted factors: price 35%, ETA 20%, reliability 25%, capability fit 20%.",
  },
  {
    title: "Evidence and controls",
    text: "Session API timelines, BscScan-linked settlement steps, and operator actions behind an explicit gate.",
  },
];

const verbs = [
  ["create", "Deploy/register agreement artifact and settlement contract"],
  ["approve_settlement", "Each agent signer approves settlement"],
  ["release", "Coordinator releases escrow after approvals"],
  ["auto_claim_timeout", "Timeout-based claim fallback path"],
  ["inspect_status", "Read settlement and pool status"],
  ["inspect_timeline", "Read lifecycle timeline with cursor support"],
  ["retry_step", "Operator retry control"],
  ["force_reveal_public_summary", "Operator summary reveal control"],
  ["escalate_dispute", "Operator dispute escalation"],
] as const;

const boundaries = [
  {
    title: "Execution boundary",
    text: "Agent runtime and orchestrator decide when lifecycle calls are attempted.",
  },
  {
    title: "Protocol boundary",
    text: "Shared-core lifecycle adapters and rail resolvers define how actions execute and verify.",
  },
  {
    title: "Evidence boundary",
    text: "On-chain state is settlement truth; session timeline is operator-facing traceability.",
  },
];

export default function DocsPage() {
  return (
    <main
      className={`${body.className} min-h-screen bg-[#f4f3ef] text-slate-900`}
    >
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8 md:px-10 md:pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5"
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5"
            >
              Dashboard
            </Link>
          </div>
          <Link
            href="https://github.com/pwilson77/agentic-dark-matter"
            className="rounded-full bg-[#163046] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f2437]"
          >
            Repository README
          </Link>
        </div>

        <header className="mt-8 dm-fade-up">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            Documentation
          </p>
          <h1
            className={`${display.className} mt-3 text-4xl leading-tight md:text-5xl`}
          >
            Agentic Dark Matter Oracle technical guide.
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-relaxed text-slate-700 md:text-lg">
            This in-app docs page now mirrors the practical runbook from the
            README: architecture boundaries, lifecycle verbs, environment modes,
            agent runtime flow, verification commands, and SDK integration
            basics.
          </p>
        </header>

        <section className="mt-8 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Networks
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              Anvil 31337 + BNB testnet 97
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              UI Runtime
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              Local 3006 / Testnet dev 3000
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Settlement model
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              Escrow + dual approval + release
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {pillars.map((pillar, idx) => (
            <article
              key={pillar.title}
              className={`dm-fade-up rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(0,0,0,0.06)] [animation-delay:${120 + idx * 110}ms]`}
            >
              <h2 className={`${display.className} text-2xl`}>
                {pillar.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">
                {pillar.text}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.06)] md:p-9">
          <h2 className={`${display.className} text-3xl`}>
            Architecture boundaries
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {boundaries.map((boundary) => (
              <div
                key={boundary.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {boundary.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {boundary.text}
                </p>
              </div>
            ))}
          </div>
          <ol className="mt-6 space-y-2 text-sm text-slate-700">
            <li>1. Orchestrator creates agreement context and escrow state.</li>
            <li>
              2. Agent A and Agent B independently approve through the same
              lifecycle APIs.
            </li>
            <li>3. Coordinator releases only after required approvals.</li>
            <li>
              4. Chain results and timeline events surface through the session
              API and dashboard.
            </li>
          </ol>
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.06)] md:p-9">
          <h2 className={`${display.className} text-3xl`}>
            Canonical lifecycle verbs
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {verbs.map(([verb, purpose]) => (
              <div
                key={verb}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">{verb}</p>
                <p className="mt-1 text-sm text-slate-700">{purpose}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.06)] md:p-9">
          <h2 className={`${display.className} text-3xl`}>Runbooks</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Use these command groups depending on environment. The dashboard
            reads runtime state from the session API and links settlement tx
            hashes to BscScan.
          </p>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
            Local flow (anvil)
          </h3>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#112437] p-4 text-xs leading-relaxed text-slate-100">
            {`npm run localchain:start
npm run agent:start:a
npm run agent:start:b
npm run demo:orchestrate
DARK_MATTER_CHAT_VISIBILITY=full npm --workspace @adm/dark-matter-ui run dev -- --hostname 0.0.0.0 --port 3006`}
          </pre>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
            BNB testnet flow
          </h3>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#112437] p-4 text-xs leading-relaxed text-slate-100">
            {`npm run testnet:fund
npm run testnet:fund:send
npm run agent:a:testnet
npm run agent:b:testnet
npm run demo:orchestrate:testnet
npm run ui:dev:testnet
npm run ui:build:testnet
npm run ui:start:testnet`}
          </pre>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
            Verification suite
          </h3>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#112437] p-4 text-xs leading-relaxed text-slate-100">
            {`npm run verify:local-pools
npm run verify:timeout-operators
npm run verify:mcp-parity
npm run verify:mcp-parity:evm
npm run verify:mcp-parity:readonly
npm run verify:mcp-parity:static
npm run verify:agent-sdk`}
          </pre>
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.06)] md:p-9">
          <h2 className={`${display.className} text-3xl`}>
            Agent SDK quick integration
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            Use <span className="font-semibold">@adm/agent-sdk</span> with{" "}
            <span className="font-semibold">AgentSdkClient</span> and
            environment-backed config. It supports create, approvals, release,
            timeout claim, and read verbs for status and timeline.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#112437] p-4 text-xs leading-relaxed text-slate-100">
            {`import { AgentSdkClient, sdkConfigFromEnv } from "@adm/agent-sdk";

const client = new AgentSdkClient(sdkConfigFromEnv());
const result = await client.runStandardLifecycle({
  createInput,
  agentAPrivateKey,
  agentBPrivateKey,
});

console.log(result.agreement.contractAddress);
console.log(result.release.txHash);`}
          </pre>
          <p className="mt-4 text-sm text-slate-700">
            Key env vars: DARK_MATTER_RPC_URL, DARK_MATTER_CHAIN_ID,
            DARK_MATTER_RAIL_ID, DARK_MATTER_POOL_SOURCE,
            DARK_MATTER_SDK_READ_MAX_ATTEMPTS, DARK_MATTER_SDK_READ_DELAY_MS.
          </p>
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl bg-[#163046] p-7 text-slate-100 md:p-9">
          <h2 className={`${display.className} text-3xl`}>
            Dashboard + operator notes
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-200">
            The dashboard view shows hero status, agent/deal cards, RFQ ranking,
            proof ribbon, and timeline transcript. Operator controls are
            intentionally gated: use
            <span className="font-semibold"> ?operator=1</span> on the dashboard
            URL to reveal retry/reveal/escalate actions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
            >
              Open Dashboard
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
