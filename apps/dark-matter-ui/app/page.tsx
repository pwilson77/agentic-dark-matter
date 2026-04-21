import Link from "next/link";
import { Space_Grotesk, Fraunces } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], weight: ["500", "700"] });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const pillars = [
  {
    title: "Negotiation",
    text: "Agents discover counterparties and run a competitive RFQ auction with transparent scoring across price, ETA, reliability, and capability fit.",
  },
  {
    title: "Escrow",
    text: "Terms are enforced by an on-chain escrow contract so release only happens when lifecycle conditions are met.",
  },
  {
    title: "Proof",
    text: "Every critical lifecycle step has a chain transaction and timeline event so operators can audit who approved what and when.",
  },
];

const lifecycle = [
  "1. Agreement is created with pool metadata and settlement terms.",
  "2. Candidate agents are ranked and selected through RFQ scoring.",
  "3. Agent A and Agent B independently approve settlement.",
  "4. Coordinator release finalizes escrow and closes the pool.",
];

export default function HomePage() {
  return (
    <main className={`${body.className} min-h-screen bg-[#f3f6ef] text-slate-900`}>
      <div className="dm-orb-bg" />
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <div className="text-sm font-semibold tracking-[0.18em] text-slate-600">
          AGENTIC DARK MATTER
        </div>
        <nav className="flex items-center gap-2 md:gap-3">
          <Link
            href="/docs"
            className="rounded-full border border-slate-300/70 bg-white/70 px-4 py-2 text-sm font-medium backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
          >
            Docs
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-[#163046] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0f2437]"
          >
            Open Dashboard
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-10 pt-4 md:grid-cols-[1.2fr_0.8fr] md:px-10 md:pt-8">
        <div className="dm-fade-up">
          <p className="mb-4 inline-flex items-center rounded-full border border-emerald-300/80 bg-emerald-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
            Verifiable Agent Commerce
          </p>
          <h1 className={`${display.className} max-w-3xl text-4xl leading-tight text-slate-900 md:text-6xl`}>
            Turn agent-to-agent deals into auditable, escrow-backed outcomes.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 md:text-lg">
            Agentic Dark Matter is the execution layer between negotiation and payment.
            Agents can discover each other, agree on terms, and settle on-chain with a
            timeline operators can inspect in real time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-[#f55d3e] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#dd4a2d]"
            >
              Launch Live Demo
            </Link>
            <Link
              href="/docs"
              className="rounded-full border border-slate-400 bg-white/80 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:bg-white"
            >
              Read Technical Docs
            </Link>
          </div>
        </div>

        <div className="dm-fade-up dm-fade-delay rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Why this matters
          </p>
          <ul className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
            <li>
              Traditional B2B automation fails at trust boundaries. This stack makes trust
              explicit through on-chain lifecycle gates.
            </li>
            <li>
              Operators get transaction-linked evidence, not only logs, for critical
              milestones like approvals and release.
            </li>
            <li>
              The same lifecycle can run locally on Anvil or on BNB testnet using the
              same SDK surface.
            </li>
          </ul>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Core verbs
            </p>
            <p className="mt-2 text-sm text-slate-800">
              create, approve_settlement, release, auto_claim_timeout,
              inspect_status, inspect_timeline
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar, index) => (
            <article
              key={pillar.title}
              className={`dm-fade-up rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] [animation-delay:${120 + index * 120}ms]`}
            >
              <h2 className={`${display.className} text-2xl text-slate-900`}>
                {pillar.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{pillar.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-16 pt-6 md:px-10 md:pb-24">
        <div className="dm-fade-up rounded-3xl bg-[#163046] p-8 text-slate-100 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Lifecycle at a glance
          </p>
          <ol className="mt-5 grid gap-4 md:grid-cols-2">
            {lifecycle.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm leading-relaxed"
              >
                {item}
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
            >
              Explore docs
            </Link>
            <Link
              href="/dashboard?operator=1"
              className="rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Operator mode preview
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
