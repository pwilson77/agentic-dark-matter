# Contracts (Foundry)

Contract-specific build and test tasks for `DarkMatterEscrow` live here.

For end-to-end execution modes (local vs hosted), see:

- `../docs/EXECUTION_MODES.md`

## Setup

1. Install Foundry.
2. Ensure `anvil`, `forge`, and `cast` are available on `PATH`.

## Build

```bash
cd contracts
forge build
```

## Test

```bash
cd contracts
forge test -vv
```

## Notes

- Contract deployment in demo flows is orchestrated from the workspace root scripts.
- Use root-level commands from `../README.md` for local/testnet demo runs.
