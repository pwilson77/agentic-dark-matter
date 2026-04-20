# Demo Plan — Tomorrow Morning

## What the demo shows

Two configured, separately-running agents discover a task, negotiate terms, deploy an on-chain escrow, independently approve settlement, and release funds — all wired through real lifecycle MCP functions against a local EVM chain.

---

## Demo flow (3 terminals + 1 UI)

| Terminal         | Command                                                                                                          | Role                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1 (Localchain)   | `npm run localchain:start`                                                                                       | Anvil EVM node                                  |
| 2 (Agent A)      | `npm run agent:start:a`                                                                                          | Coordinator agent — approves + triggers release |
| 3 (Agent B)      | `npm run agent:start:b`                                                                                          | Executor agent — approves only                  |
| 4 (Orchestrator) | `npm run demo:orchestrate`                                                                                       | Negotiates, deploys escrow, registers task      |
| 5 (UI)           | `DARK_MATTER_CHAT_VISIBILITY=full npm --workspace @adm/dark-matter-ui run dev -- --hostname 0.0.0.0 --port 3006` | Live dashboard                                  |

**What you'll see:**

1. Orchestrator prints negotiation transcript + deployment tx hash.
2. Both agent terminals print `Approving settlement for contract 0x...` + tx hash.
3. Agent A prints `Released. tx=0x...`.
4. Orchestrator prints `DEMO COMPLETE — Settlement Released`.
5. UI at `:3006` shows pool status = `completed`, released = `true`.

---

## Today's build list (already done ✓)

- [x] `agents/agent-a/config.json` — Agent A identity, wallet, behavior config
- [x] `agents/agent-b/config.json` — Agent B identity, wallet, behavior config
- [x] `apps/agent-runtime/src/cli.ts` — Implemented typed runtime for agent loop + orchestrator flow
- [x] npm scripts: `agent:start:a`, `agent:start:b`, `demo:orchestrate`
- [x] On-chain E2E lifecycle verified end-to-end (create/approve/approve/release)
- [x] MCP parity matrix passing for both rails
- [x] UI + session API serving local pool data

---

## Tomorrow backlog (post-demo)

### Short-term (this week)

- [ ] **SDK package** — standalone `@adm/agent-sdk` wrapping `@adm/agent-runtime` logic as an importable module
- [ ] **Task posting API** — REST endpoint so an agent can POST a task offer without running the orchestrator script manually
- [ ] **Evidence / proof submission** — agent B submits a proof hash before approving; coordinator validates it before releasing
- [ ] **Capability matching** — orchestrator queries registry and picks best-fit agent B based on `acceptedCapabilities`
- [ ] **Per-agent log files** — write agent events to `agents/agent-a/run.log` + `agents/agent-b/run.log`
- [ ] **Configurable deployer** — separate deployer key from agent A key in config

### Medium-term (next 2 weeks)

- [ ] **Agent registry endpoint** — `GET /api/agents` lists registered agents with capability tags + performance metrics
- [ ] **Reputation ledger** — track completion rate / dispute rate / avg settlement time per wallet
- [ ] **Webhook events** — POST to configurable URL on each lifecycle transition (deployed / approved / released)
- [ ] **Recurring task streams** — pool auto-renew on completion
- [ ] **Timeout-claim demo mode** — run same 3-terminal flow but skip agent B approval to demo auto-claim path

### Longer-term (month 2+)

- [ ] **MCP server** — expose agent actions as MCP tools so external AI frameworks can call them natively
- [ ] **Agent operator playbook** — doc explaining how to run a production agent with real keys on BNB testnet
- [ ] **Budget caps + allowlists** — policy controls per task pool
- [ ] **Public agent registry UI page** — capability search, earnings history, reputation scores
- [ ] **Fee rebate incentive program** — first N completed jobs get reduced platform fee
- [ ] **Second production rail** — replace simulated rail with a real alternate settlement chain

---

## Agent config location

```
agents/
  agent-a/
    config.json     ← identity, role: coordinator, wallet, behavior
  agent-b/
    config.json     ← identity, role: executor, wallet, behavior
```

Override private keys via environment variables (`AGENT_A_PRIVATE_KEY`, `AGENT_B_PRIVATE_KEY`) — never hardcode in config.

---

## Shared state file

Agents communicate through `/tmp/adm-agent-state.json` (configurable via `AGENT_STATE_FILE`).

Structure:

```json
{
  "agreements": [
    {
      "agreementId": "...",
      "contractAddress": "0x...",
      "agentA": "0x...",
      "agentB": "0x...",
      "status": "deployed | completed | failed",
      "approvals": ["0x..."],
      "approveTxHashes": { "0x...": "0x..." },
      "releaseTxHash": "0x...",
      "createdAt": "...",
      "meta": {}
    }
  ]
}
```
