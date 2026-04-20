# Execution Modes

## Overview

The project supports two operational paths:

1. Local mode (`anvil-local`): deterministic developer/testing loop.
2. Hosted/testnet mode (`bsc-testnet`): funded deployer and signer keys on live testnet.

## Local Mode

### One command

```bash
npm run bootstrap:local
```

### Manual path

```bash
cp .env.localchain.example .env.localchain
npm run dark-matter:demo:local
```

### Required env keys (local)

- `DARK_MATTER_NETWORK=anvil-local`
- `DARK_MATTER_RPC_URL=http://127.0.0.1:8545`
- `DARK_MATTER_CHAIN_ID=31337`
- signer/deployer keys from Anvil defaults

### Optional env keys (local)

- `DARK_MATTER_SETTLEMENT_MODE=standard|timeout-claim`
- `DARK_MATTER_OPERATOR_PRIVATE_KEY=<optional override signer key>`
- `DARK_MATTER_TRANSCRIPT_STORE=memory|file`
- `DARK_MATTER_TRANSCRIPT_FILE=/tmp/agentic-dark-matter-transcripts-local.json`
- `DARK_MATTER_ACTION_GRAPH_STORE=memory|file`
- `DARK_MATTER_ACTION_GRAPH_FILE=/tmp/agentic-dark-matter-action-graphs-local.json`
- `DARK_MATTER_OPERATOR_API_URL=http://127.0.0.1:3000`
- `DARK_MATTER_ALLOW_SECRET_COLLUSION=true|false`

## Hosted/Testnet Mode

### One command

```bash
npm run bootstrap:hosted
```

### Manual path

```bash
cp .env.testnet.example .env.testnet
npm run dark-matter:demo:testnet
```

### Required env keys (testnet)

- `DARK_MATTER_NETWORK=bsc-testnet`
- `DARK_MATTER_RPC_URL=<bnb-testnet-rpc>`
- `DARK_MATTER_CHAIN_ID=97`
- funded `DARK_MATTER_DEPLOYER_PRIVATE_KEY`
- settlement signer keys and matching addresses

## Validation

### Contract tests

```bash
npm run contracts:test
```

### Typechecks

```bash
npm run -w @adm/shared-core typecheck
npm run -w @adm/dark-matter-demo typecheck
npm run -w @adm/dark-matter-ui typecheck
```

### Local event + API verification

```bash
npm run verify:local-pools
npm run verify:timeout-operators
npm run verify:mcp-parity
npm run verify:mcp-parity:evm
npm run verify:mcp-parity:readonly
npm run verify:mcp-parity:static
```

## Troubleshooting

- If local demo fails on missing `anvil`, install Foundry and ensure `$HOME/.foundry/bin` is on `PATH`.
- If local RPC port is busy, stop conflicting process on `8545` or update env values consistently.
- If operator actions are not visible in timeline, ensure `DARK_MATTER_SESSION_FILE` points to the same JSONL file for demo and API.
