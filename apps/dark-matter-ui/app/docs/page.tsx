import Link from "next/link";
import { Space_Grotesk, Fraunces } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "700"] });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const sections = [
  {
    title: "What it is",
    points: [
      "An execution layer for agent-to-agent commerce with escrow-backed settlement.",
      "Built for deterministic lifecycle verbs and verifiable outcomes.",
      "Runs on anvil-local (31337) and BNB testnet (97).",
    ],
  },
  {
    title: "Core lifecycle",
    points: [
      "create: deploy/register agreement artifact and settlement contract",
      "approve_settlement: each agent signer approves independently",
      "release: coordinator finalizes payout after required approvals",
      "auto_claim_timeout + inspect verbs for fallback and observability",
    ],
  },
  {
    title: "How to use",
    points: [
      "Use @adm/agent-sdk via AgentSdkClient for typed lifecycle operations.",
      "Use /dashboard for live pool timeline, approvals, and settlement proof links.",
      "Run verifiers for parity and integration confidence before deploy.",
    ],
  },
];

export default function DocsPage() {
  return (
    <main className={`${body.className} min-h-screen bg-[#f4f3ef] text-slate-900`}>
      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8 md:px-10 md:pb-24">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5"
          >
            Back Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-[#163046] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f2437]"
          >
            Open Dashboard
          </Link>
        </div>

        <header className="mt-8 dm-fade-up">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            Documentation
          </p>
          <h1 className={`${display.className} mt-3 text-4xl leading-tight md:text-5xl`}>
            Build and operate verifiable A2A settlement flows.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700 md:text-lg">
            This page gives the quick technical narrative. For full command references,
            environment setup, and verifier scripts, continue to the repository README.
          </p>
          <Link
            href="https://github.com/pwilson77/agentic-dark-matter"
            className="mt-5 inline-flex rounded-full bg-[#f55d3e] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#dd4a2d]"
          >
            Full README on GitHub
          </Link>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {sections.map((section, sectionIndex) => (
            <article
              key={section.title}
              className={`dm-fade-up rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(0,0,0,0.06)] [animation-delay:${120 + sectionIndex * 120}ms]`}
            >
              <h2 className={`${display.className} text-2xl`}>{section.title}</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
                {section.points.map((point) => (
                  <li key={point} className="rounded-xl bg-slate-50 p-3">
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-10 dm-fade-up rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_28px_rgba(0,0,0,0.06)] md:p-9">
          <h2 className={`${display.className} text-3xl`}>Recommended run flow</h2>
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-slate-700">
            <li className="rounded-xl border border-slate-200 p-4">
              1. Start chain and fund agents for the selected environment (local or testnet).
            </li>
            <li className="rounded-xl border border-slate-200 p-4">
              2. Start both agent runtimes with matching settlement mode and rail config.
            </li>
            <li className="rounded-xl border border-slate-200 p-4">
              3. Run orchestration, then confirm timeline and proof ribbon in the dashboard.
            </li>
            <li className="rounded-xl border border-slate-200 p-4">
              4. Execute verifier scripts before shipping any flow changes.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
