# Improvements Extraction from ENACT and OneAI Agent OS

Date: 2026-04-19

## Objective

Capture practical improvements to adopt from two hackathon submissions and identify what should remain unique in this project.

## Inputs Reviewed

- ENACT (TON escrow protocol for agent commerce)
- OneAI Agent OS (coordination system from intent to execution)

## High-Value Extracts

### 1) Protocol and Settlement (from ENACT)

- Pluggable evaluator identity:
  - Keep evaluator as a neutral address primitive.
  - Evaluator can be human, AI, contract, DAO, or hybrid.
- Hard liveness guarantees:
  - Add explicit timeout paths for evaluator silence.
  - Provider auto-claim after timeout should be first-class.
- Multi-asset parity:
  - Keep one lifecycle model even when adding multiple asset rails.
  - Avoid per-asset UX divergence.
- Isolated per-job/per-pool deployments:
  - Preserve blast-radius isolation and clean accounting boundaries.
- Interface parity:
  - SDK, API/MCP, and bot/client should expose the same lifecycle verbs.

### 2) Product and Coordination UX (from OneAI)

- Outcome loop framing:
  - Present user flow as Intent -> Plan -> Execute -> Outcome.
- Structured execution graph:
  - Store and expose an action graph for each run.
  - Makes evaluation and replay easier.
- Real-time visibility:
  - Add live stream updates for run state and timeline events.
  - Keep logs understandable for non-technical users.
- Operator interface:
  - Include a lightweight control surface for intervention, retry, and escalation.

### 3) Distribution and Adoption (from both)

- Dual operation modes:
  - Hosted mode for low-friction onboarding.
  - Local mode for power users and secure environments.
- One-command setup paths:
  - Fast install + first successful run matters more than feature breadth.
- Public, testable claims:
  - Keep reproducible scripts for E2E lifecycle proof.

## What To Implement First (Priority)

### P0 (Immediate)

- Add explicit evaluator-timeout and provider auto-claim flow in protocol/state machine.
- Introduce lifecycle verb parity checklist across UI API, MCP tools, and scripts.
- Add a single live timeline endpoint for session/pool updates.

### P1 (Next)

- Add structured action graph artifact per negotiation/execution run.
- Add hosted-vs-local execution mode docs with one-command bootstrap.
- Add operator actions: retry step, force reveal public summary, escalate to dispute.

### P1 Progress (Implemented)

- Structured action graph artifact persistence added in shared-core with hash + storage reference.
- Demo run now emits action graph artifact metadata into session timeline events.
- Operator action surface added (retry-step, force-reveal-public-summary, escalate-dispute) with API route and timeline visibility.
- UI timeline now supports operator action buttons and action result feedback.
- Added `verify:timeout-operators` script for timeout and operator-action flow verification.
- Added MCP-style operator wrappers in shared-core for retry/reveal/escalate calls.
- Added MCP-style lifecycle wrappers in shared-core for create/approve/release/timeout-claim/status/timeline calls.
- Added `verify:mcp-parity` script to exercise all nine canonical lifecycle/operator verbs end-to-end.
- Added best-effort on-chain timeout override hook for retry/escalate when contract + signer are available.
- Execution docs + one-command bootstrap added (`README.md`, `docs/EXECUTION_MODES.md`, `scripts/bootstrap-local.sh`).
- Added Phase A multi-asset rail abstraction scaffolding in shared-core (`railAdapter`, `evmRailAdapter`, `railResolver`).
- Routed lifecycle MCP create/approve/release/timeout calls through rail resolution (default `evm-bnb`) without behavior change.
- Added second simulated rail adapter (`simulated-readonly`) with simulated lifecycle write semantics (create/approve/release/timeout) plus inspect parity.
- Routed MCP inspect status/timeline through rail adapters (resolver-based) instead of direct lifecycle-level API calls.
- Upgraded MCP parity verifier to rail-aware matrix mode (`evm-bnb` full verbs + `simulated-readonly` simulated full verbs) with static CI-safe mode.
- Added CI parity gate workflow for static rail matrix + workspace typechecks.
- Runtime verifier suite now passes locally when Anvil + UI API are running (`verify:local-pools`, `verify:timeout-operators`, `verify:mcp-parity`).

### P2 (Later)

- Multi-asset rail extension with lifecycle parity tests.
- Advanced evaluator plugins (human-in-the-loop, contract policy, DAO policy).

## Extractability Matrix

### Easy Wins

- Lifecycle parity checklist
- One-command bootstrap and verifier docs
- Real-time timeline stream (polling first, then SSE)

### Medium Complexity

- Structured action graph schema and storage
- Evaluator-timeout auto-claim with robust edge-case tests

### Hard but High-Leverage

- Multi-asset lifecycle parity without UX fragmentation
- Evaluator plugin ecosystem and governance model

## What Should Stay Unique Here

- Verifiable commerce core:
  - Trustless settlement plus cryptographic transcript artifacts.
- Privacy-preserving transparency:
  - Public lifecycle proofs with policy-based selective disclosure.
- Agent-governed visibility:
  - Visibility policy decided by protocol/agents, not end-user toggles.
- Local-to-production credibility path:
  - Deterministic local simulation -> event-derived local indexing -> production indexer path.

## Suggested Positioning

This project is the verifiable execution layer for agent commerce: agents can negotiate privately, settle trustlessly on-chain, and reveal only the minimum necessary evidence for counterparties, operators, and auditors.

## Immediate Backlog Items

1. Add timeout transition and auto-claim tests for evaluator silence.
2. Implement live timeline delivery in UI (polling baseline, SSE upgrade path).
3. Define action-graph JSON schema and attach artifact hash to timeline.
4. Publish lifecycle parity table for UI API, MCP, SDK, and CLI scripts.
5. Add an end-to-end script that demonstrates both public and hidden transcript lines with policy filtering.
6. Upgrade operator-action markers to on-chain dispute/override flows where required.
