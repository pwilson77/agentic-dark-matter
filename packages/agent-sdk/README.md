# @adm/agent-sdk

Typed SDK for integrating agents with Agentic Dark Matter lifecycle operations.

## What this package provides

- Typed wrappers over canonical lifecycle operations
- Config normalization and env-based config loading
- Unified SDK error model for caller-friendly handling
- Convenience flow helper for standard create/approve/release lifecycle

## Install (workspace)

```bash
npm --workspace @adm/agent-sdk run build
```

## Quick usage

```ts
import { AgentSdkClient, sdkConfigFromEnv } from "@adm/agent-sdk";

const client = new AgentSdkClient(sdkConfigFromEnv());

const status = await client.inspectStatus({ source: "local" });
console.log(status.selectedPoolId);
```

## Standard lifecycle helper

```ts
const result = await client.runStandardLifecycle({
  createInput,
  agentAPrivateKey,
  agentBPrivateKey,
});

console.log(result.agreement.contractAddress);
console.log(result.release.txHash);
```

## Public API

- `createAgreement(input)`
- `approveSettlement(input)`
- `release(input)`
- `autoClaimTimeout(input)`
- `inspectStatus(input?)`
- `inspectTimeline(input?)`
- `runStandardLifecycle(input)`

## Validation

From repository root:

```bash
npm run verify:agent-sdk
```
