# Dark Matter Lifecycle Verb Parity Checklist

Date: 2026-04-19
Scope: P0-P1 parity audit across contract, shared-core, UI API, and scripts.

## Canonical Lifecycle Verbs

1. create
2. approve_settlement (agentA/agentB)
3. release
4. auto_claim_timeout
5. inspect_status
6. inspect_timeline
7. retry_step
8. force_reveal_public_summary
9. escalate_dispute

## Surface Coverage Matrix

| Verb                        | Contract                                           | shared-core                                                                                   | UI API                                                                                               | Scripts                                                      | Status                            |
| --------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| create                      | `constructor` deploys pool and emits `PoolCreated` | `deployDarkMatterAgreement`                                                                   | `/api/session?source=local` reads chain-created pools                                                | `dark-matter:demo` deploy path                               | implemented                       |
| approve_settlement          | `approveSettlement()`                              | `executeSettlement()` calls both approvals                                                    | timeline status uses `PoolStatusChanged` approved events                                             | `dark-matter:demo` executes settlement                       | implemented                       |
| release                     | `release()`                                        | `executeSettlement()` calls release                                                           | local status maps released -> completed                                                              | `dark-matter:demo` release path                              | implemented                       |
| auto_claim_timeout          | `claimAfterTimeout()` with `AUTO_CLAIM_TIMEOUT`    | `executeSettlement({ mode: "timeout-claim" })` + `autoClaimTimeoutViaMcp()`                   | local status maps timeout/auto-claimed -> completed                                                  | `verify:mcp-parity` timeout path                             | implemented                       |
| inspect_status              | view fields + event logs                           | helpers read release and participants                                                         | `/api/session` emits pool status/progress                                                            | `verify-local-pools.mjs` validates source and IDs            | implemented                       |
| inspect_timeline            | `PoolStatusChanged` + settlement events            | transcript/event emitters in demo flow + action-graph persistence + `inspectTimelineViaMcp()` | `/api/session` timeline + `/api/session?live=1&since=N` incremental timeline + action graph metadata | `verify:mcp-parity` includes rail-aware cursor-based inspect | implemented                       |
| retry_step                  | no contract mutation in P1                         | `executeOperatorAction()` accepts `retry-step`                                                | `POST /api/session/action` appends operator action event                                             | UI timeline action button wired                              | implemented (off-chain marker)    |
| force_reveal_public_summary | no contract mutation in P1                         | `executeOperatorAction()` accepts `force-reveal-public-summary`                               | `POST /api/session/action` generates safe summary from visible transcript lines                      | UI timeline action button wired                              | implemented (policy-safe summary) |
| escalate_dispute            | no contract dispute path yet                       | `executeOperatorAction()` accepts `escalate-dispute`                                          | `POST /api/session/action` records dispute escalation marker                                         | UI timeline action button wired                              | implemented (off-chain marker)    |

## P0 Gaps To Close Next

1. Extend verifier to assert explicit on-chain timeout-claim tx hash in every run (not just timeline signals).
2. Add deterministic contract-layer dispute/override path to replace current best-effort operator escalation behavior.
3. Upgrade operator actions from best-effort on-chain override to deterministic on-chain dispute/override contract paths when available.

## Acceptance Checklist

- [x] Timeout claim exists at contract layer with guardrails.
- [x] Local API interprets timeout claim as completed lifecycle status.
- [x] UI API exposes incremental live timeline feed.
- [x] shared-core settlement supports explicit timeout claim mode.
- [x] Action graph artifact persisted and linked into session timeline metadata.
- [x] Operator action endpoint + UI controls implemented for retry/reveal/escalate.
- [x] script-based timeout + operator-action verification exists (`verify:timeout-operators`).
- [x] MCP wrapper parity for all lifecycle verbs exists (create/approve/release/timeout-claim/status/timeline + operator wrappers).
- [x] Rail-aware MCP parity matrix verifier exists and passes (`verify:mcp-parity`, `verify:mcp-parity:evm`, `verify:mcp-parity:readonly`).
- [x] CI parity gate exists for static rail-by-verb matrix + typechecks (`.github/workflows/parity-gate.yml`).
- [x] Simulated rail now supports full lifecycle parity semantics (simulated create/approve/release/timeout + inspect + operator actions).
