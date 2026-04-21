---
name: adm-agent-sdk
description: Use this skill when an agent needs to import and drive the Agentic Dark Matter SDK (`@adm/agent-sdk`) to create agreements, approve settlement, release escrow, auto-claim on timeout, or inspect pool status/timeline on anvil-local or BNB testnet. Load it whenever the user mentions `@adm/agent-sdk`, `AgentSdkClient`, `runStandardLifecycle`, `createAgreement`, `approveSettlement`, `release`, `inspectStatus`, `inspectTimeline`, or "Agentic Dark Matter" / "A2A settlement" / "escrow lifecycle" SDK integration.
---

# Agentic Dark Matter SDK

Typed client over the canonical A2A lifecycle verbs: `create → approve_settlement → release` (plus `auto_claim_timeout`, `inspect_status`, `inspect_timeline`). Same client works against anvil-local (`chainId=31337`) and BNB testnet (`chainId=97`).

## When to use this skill

- The user is wiring an agent / service to call Agentic Dark Matter.
- The user mentions `@adm/agent-sdk`, `AgentSdkClient`, `runStandardLifecycle`, or any verb above.
- The user wants to deploy an escrow, exchange approvals, and release from code.
- The user needs to read pool status or a lifecycle timeline.

## Install

Monorepo (from repo root):

```bash
npm install ./packages/agent-sdk
npm run sdk:build
```

Published:

```bash
npm install @adm/agent-sdk
```

## Minimum environment

Set these before instantiating the client. `sdkConfigFromEnv()` reads them all with safe defaults.

| Variable | Default | Notes |
| --- | --- | --- |
| `DARK_MATTER_RPC_URL` | `http://127.0.0.1:8545` | Anvil local, or `https://data-seed-prebsc-1-s1.bnbchain.org:8545` for BNB testnet |
| `DARK_MATTER_CHAIN_ID` | `31337` | `97` for BNB testnet |
| `DARK_MATTER_RAIL_ID` | `evm-bnb` | Canonical rail id |
| `DARK_MATTER_POOL_SOURCE` | `local` | `local` reads `/tmp/adm-agent-state.json`; `mock` for demos; `prod` for hosted |
| `DARK_MATTER_SDK_READ_MAX_ATTEMPTS` | `1` | Retries for `inspectStatus` / `inspectTimeline` |
| `DARK_MATTER_SDK_READ_DELAY_MS` | `300` | Delay between read retries |

Agent signer private keys are **inputs to each call**, not env-loaded by the SDK. Caller decides how to store them.

## Quickstart

```ts
import { AgentSdkClient, sdkConfigFromEnv } from "@adm/agent-sdk";

const client = new AgentSdkClient(sdkConfigFromEnv());

const status = await client.inspectStatus({ source: "local" });
console.log(status.selectedPoolId);
```

Explicit config (no env):

```ts
import { AgentSdkClient } from "@adm/agent-sdk";

const client = new AgentSdkClient({
  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  railId: "evm-bnb",
  source: "local",
  retries: { readMaxAttempts: 3, readDelayMs: 500 },
});
```

## Standard lifecycle (one call)

Deploy escrow, run both approvals, and release in one helper. Both private keys must be 32-byte hex (`0x` + 64 hex chars).

```ts
const result = await client.runStandardLifecycle({
  createInput: {
    // shape of DeployAgreementInput from @adm/shared-core
    agentAAddress: "0x70997970...",
    agentBAddress: "0x3C44Cd...",
    escrowBnb: 0.1,
    // capability / metadata fields per shared-core types
  },
  agentAPrivateKey: process.env.AGENT_A_PRIVATE_KEY!,
  agentBPrivateKey: process.env.AGENT_B_PRIVATE_KEY!,
  // optional: defaults to agentAPrivateKey
  releaseSignerPrivateKey: process.env.AGENT_A_PRIVATE_KEY!,
});

console.log("contract:", result.agreement.contractAddress);
console.log("approve A:", result.approveA.txHash);
console.log("approve B:", result.approveB.txHash);
console.log("release:",  result.release.txHash);
```

## Per-verb reference

All verbs throw `AgentSdkError` on failure; wrap in try/catch.

```ts
// 1. Create / deploy
const agreement = await client.createAgreement(createInput);

// 2. Approve (each agent signs)
const approveA = await client.approveSettlement({
  contractAddress: agreement.contractAddress,
  signerPrivateKey: agentAKey,
});

// 3. Release (coordinator only, after both approvals)
const release = await client.release({
  contractAddress: agreement.contractAddress,
  signerPrivateKey: agentAKey,
});

// 4. Timeout claim (if counterparty fails to approve in window)
const claim = await client.autoClaimTimeout({
  contractAddress: agreement.contractAddress,
  signerPrivateKey: agentAKey,
});

// 5. Reads (retryable via config.retries)
const status = await client.inspectStatus({ poolId: "..." });
const timeline = await client.inspectTimeline({
  poolId: "...",
  sinceCursor: 0,
});
```

Every write verb accepts an optional per-call `rpcUrl` and `railId` override. Defaults come from the config passed at construction time.

## Error handling

```ts
import { AgentSdkError } from "@adm/agent-sdk";

try {
  await client.release({ contractAddress, signerPrivateKey });
} catch (err) {
  if (err instanceof AgentSdkError) {
    // err.code: INVALID_INPUT | INVALID_CONFIG | OPERATION_FAILED | ...
    // err.operation: which SDK method
    // err.retriable: true on transient read failures
    if (err.retriable) {
      // back off and retry
    }
  }
  throw err;
}
```

Input validation happens before the call — expect `INVALID_INPUT` for:
- `signerPrivateKey` not matching `^0x[a-fA-F0-9]{64}$`
- `contractAddress` not matching `^0x[a-fA-F0-9]{40}$`

## Verification

From repo root:

```bash
npm run verify:agent-sdk
```

This runs a full deploy → approve A → approve B → release against the configured RPC. Use it as a smoke test after wiring the SDK into a new service.

## Common pitfalls

- **Wrong chain** — set `DARK_MATTER_RPC_URL` and the agent wallet balances before calling. On BNB testnet, fund both wallets first (`npm run testnet:fund:send` from the repo).
- **Release before both approvals** — `release` will revert on-chain. Always `inspectStatus` (or use `runStandardLifecycle`) to confirm both approvals first.
- **Source mismatch** — `inspectStatus({ source: "mock" })` reads static fixtures, not live chain. Use `local` or `prod` in production code.
- **Missing `DARK_MATTER_POOL_SOURCE`** — SDK defaults to `local`, which reads `/tmp/adm-agent-state.json`. If your process doesn't have access to that file, pass `source: "prod"` explicitly.
- **Rail id** — leave as `evm-bnb` unless adding a new rail; other values go through the rail resolver and may not have write semantics.

## Public API

- `AgentSdkClient` — main class (constructor takes `AgentSdkConfig`).
- `sdkConfigFromEnv(env?)` — reads `DARK_MATTER_*` env vars.
- `normalizeSdkConfig(config)` — throws `INVALID_CONFIG` if `rpcUrl` is missing.
- `AgentSdkError`, `toSdkError`, `AgentSdkErrorCode`.
- Types: `CreateAgreementInput`, `ApproveSettlementInput`, `ReleaseSettlementInput`, `AutoClaimTimeoutInput`, `InspectStatusInput`, `InspectTimelineInput`, `RunStandardLifecycleInput`, `RunStandardLifecycleResult`, `AgreementArtifact`.

## References (repo-relative)

- Package: `packages/agent-sdk/`
- Client: `packages/agent-sdk/src/client.ts`
- Config + env: `packages/agent-sdk/src/config.ts`
- Types: `packages/agent-sdk/src/types.ts`
- Errors: `packages/agent-sdk/src/errors.ts`
- Shared-core verbs: `packages/shared-core/src/index.ts`
- Verifier: `scripts/verify-agent-sdk.mjs`
