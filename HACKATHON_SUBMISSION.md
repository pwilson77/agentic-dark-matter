# Agentic Dark Matter

## Subtitle

The Confidential Coordination Layer for the Autonomous Agent Economy

## Project Overview

In the shift toward Agentic Mode, autonomous AI agents are becoming economic actors on BNB Chain. Agentic Dark Matter provides execution rails for agent-to-agent work: agents can run RFQs, submit competing bids, select a winner, deploy escrow, approve settlement, and release on-chain with verifiable transaction proof.

Today, this is implemented as a multi-agent marketplace flow with a coordinator (Agent A) and multiple executors (Agent B/C), running locally and on BNB testnet.

## The Problem

1. Coordination friction: Agents can plan tasks, but lack reliable economic rails to contract and settle work.
2. Trust gap: Without verifiable settlement, counterparties cannot confidently automate high-value execution.
3. Operational fragility: Live agent workflows need resilient orchestration across local and testnet environments.

## The Solution (How It Works)

Agentic Dark Matter enables a verifiable A2A workflow:

1. RFQ + bidding marketplace

- User submits a task intent.
- Executor agents evaluate capability fit and submit bids with rationale.
- Coordinator agent selects a winner (LLM-guided with deterministic fallback).

2. On-chain escrow lifecycle

- Escrow agreement is deployed.
- Executor submits an on-chain delivery proof hash.
- Both sides approve settlement.
- Release is executed and surfaced with transaction receipts/timeline evidence.

3. Operator-grade reliability

- Timeout handling, deterministic fallback, clear diagnostics, and testnet RPC failover improve live demo reliability.

## Technical Implementation (Implemented)

1. BNB testnet + local support

- Unified runtime flow across anvil local and BNB testnet.

2. Lifecycle adapter pattern

- Canonical create/approve/release/timeout verbs through shared MCP-style adapters.

3. Custom Solidity escrow

- Proof-gated release: executor must submit an on-chain delivery proof hash before release can succeed.
- Split payout (60/40 bps) to agent wallets on both release and timeout-claim paths.
- 14/14 contract tests passing covering proof requirement, split distribution, and timeout behavior.

4. Signed negotiation envelopes

- Off-chain negotiation terms are committed as signed envelopes with nonce replay protection.
- Policy validation gate in orchestrator rejects malformed or replayed envelopes before escrow deploys.
- Envelope events appear in the UI session timeline.

5. DGrid relay transport

- Orchestrator optionally relays signed negotiation envelopes to a DGrid endpoint.
- Supports strict mode (relay failure blocks flow) and non-strict mode (warning only).
- Relay outcome (published/failed counts, topic, endpoint) is persisted in agreement metadata and surfaced as a timeline event in the dashboard.
- Environment flags: `DARK_MATTER_DGRID_ENABLED`, `DARK_MATTER_DGRID_ENDPOINT`, `DARK_MATTER_DGRID_TOPIC`, `DARK_MATTER_DGRID_STRICT`.

6. Agent runtime + UI evidence

- Multi-process agents, shared state/timeline projection, and dashboard proof ribbon for lifecycle visibility.

## Current Payout Semantics

Release distributes escrow to participant agent wallets using on-chain revenue-share bps (currently 60/40 between Agent A and Agent B), and requires an executor-submitted delivery proof hash before release can succeed.

## Roadmap / Next Milestones

1. Richer private coordination rails

- Expand encrypted off-chain negotiation and artifact handling with verifiable transcripts.

2. Advanced identity/reputation integrations

- Deepen registry-backed agent identity and reputation-aware partner selection.

3. Broader relay network

- Extend DGrid relay to support multi-topic fan-out and relay receipt aggregation across agent networks.

## One-Liner

Agentic Dark Matter lets autonomous agents negotiate tasks, execute escrow settlement, and finalize deals on-chain with verifiable lifecycle proof.
