# BNB Testnet Migration Plan

**Objective:** Move Agentic Dark Matter Oracle from local anvil to BNB testnet (Chapel) with real agent coordination, RFQ-driven counterparty selection, and public visibility.

**Current State:** Local demo with hardcoded agents (A, B, C, D) on anvil (chainId=31337)  
**Target State:** Live testnet agreements with multi-agent RFQ selection and operator-facing UI  
**Timeline Estimate:** 2–3 days for full setup + validation

---

## Phase 1: Infrastructure & Network Configuration

### 1.1 RPC & Chain Setup
- **Network:** BNB Smart Chain Testnet (Chapel)
  - Chain ID: `97`
  - RPC Endpoint: `https://data-seed-prebsc-1-s1.bnbchain.org:8545` (or alternative: `https://bsc-testnet.publicnode.com`)
  - Block Explorer: https://testnet.bscscan.com
- **Local Mirrors (optional):**
  - Run local anvil fork: `anvil --fork-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 --chain-id 97`
  - Useful for rapid iteration without testnet RPC rate limits

### 1.2 Environment Configuration
- **File:** Copy `.env.testnet.example` → `.env.testnet`
- **Required fields to populate:**
  ```bash
  DARK_MATTER_NETWORK=bsc-testnet
  DARK_MATTER_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
  DARK_MATTER_CHAIN_ID=97
  
  # Generated/funded wallets (see 2.1)
  DARK_MATTER_DEPLOYER_PRIVATE_KEY=
  DARK_MATTER_AGENT_A_ADDRESS=
  DARK_MATTER_AGENT_B_ADDRESS=
  DARK_MATTER_AGENT_A_PRIVATE_KEY=
  DARK_MATTER_AGENT_B_PRIVATE_KEY=
  DARK_MATTER_OPERATOR_PRIVATE_KEY=
  
  # Security & persistence
  DARK_MATTER_TRANSCRIPT_SECRET=<generate-unique-secret>
  DARK_MATTER_TRANSCRIPT_FILE=/tmp/agentic-dark-matter-transcripts-bsc-testnet.json
  DARK_MATTER_ACTION_GRAPH_FILE=/tmp/agentic-dark-matter-action-graphs-bsc-testnet.json
  ```

### 1.3 Update NPM Scripts
- **Add testnet scripts to `package.json`:**
  ```json
  "scripts": {
    "demo:orchestrate:testnet": "npm run build && npm run -w @adm/agent-runtime orchestrate -- --env .env.testnet",
    "agent:a:testnet": "npm run -w @adm/agent-runtime agent -- agent-a --env .env.testnet",
    "agent:b:testnet": "npm run -w @adm/agent-runtime agent -- agent-b --env .env.testnet"
  }
  ```
- **Leverage existing bootstrap:** Modify `npm run bootstrap:testnet` to setup, build, and validate contracts

---

## Phase 2: Wallet & Funding Strategy

### 2.1 Generate Agent Wallets
**Option A: Generate fresh wallets (recommended for isolation)**
```bash
# Using ethers.js or hardhat
npm run -w @adm/agent-runtime wallet:generate -- --count 4 --output wallets.testnet.json
```
Output:
```json
{
  "deployer": { "address": "0x...", "privateKey": "0x..." },
  "agentA": { "address": "0x...", "privateKey": "0x..." },
  "agentB": { "address": "0x...", "privateKey": "0x..." },
  "operator": { "address": "0x...", "privateKey": "0x..." }
}
```

**Option B: Reuse hardhat accounts** (faster for dev)
```bash
# Hardhat derives these deterministically from network mnemonic
# Address 0: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 → Agent A
# Address 1: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC → Agent B
# Address 2: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 → Operator
```

### 2.2 Fund Wallets on BNB Testnet
**Testnet faucets:**
- Official: https://testnet.binance.org/faucet-smart
- Alternative: https://faucet.quicknode.com/bsc
- Community: https://www.bsctestnets.com/

**Funding targets (per wallet):**
- **Deployer:** 5 BNB (contract deployment gas)
- **Agent A:** 2 BNB (approval txs + release txs)
- **Agent B:** 2 BNB (approval txs)
- **Operator:** 1 BNB (operator actions + UI maintenance)

**Total:** ~10 BNB testnet needed  
**Expected wait:** 5–30 minutes per faucet request

### 2.3 Funding Verification
```bash
npm run -w @adm/agent-runtime check:balance -- --env .env.testnet --min-balance 1.0
```

---

## Phase 3: Smart Contract Deployment

### 3.1 Compile & Deploy
**Contracts to deploy:**
- `SettlementEscrow.sol` — Core escrow lifecycle (create/approve/release/timeout)
- `GovernanceRail.sol` — Operator controls (retry, escalate, reveal)
- `TokenVault.sol` — Holds settlement funds during negotiation

**Deployment process:**
```bash
# 1. Build & validate contracts
npm run -w @adm/shared-core compile:contracts

# 2. Deploy to testnet
npm run -w @adm/agent-runtime deploy:contracts -- \
  --env .env.testnet \
  --network bsc-testnet \
  --deployer-key $DARK_MATTER_DEPLOYER_PRIVATE_KEY
```

**Output:** Contract addresses (store in `.env.testnet`)
```
DARK_MATTER_SETTLEMENT_ESCROW_ADDRESS=0x...
DARK_MATTER_GOVERNANCE_RAIL_ADDRESS=0x...
DARK_MATTER_TOKEN_VAULT_ADDRESS=0x...
```

### 3.2 Contract Verification (Etherscan)
- **Automatic via hardhat:**
  ```bash
  npm run -w @adm/shared-core verify:contracts -- \
    --network bsc-testnet \
    --addresses <json-from-deploy>
  ```
- **Manual via Etherscan UI:** https://testnet.bscscan.com → Verify Contract
- **Benefits:** Public source code visibility, ABI for third-party tools

### 3.3 Gas Optimization Check
```bash
npm run -w @adm/shared-core analyze:gas -- \
  --network bsc-testnet \
  --compare-local
```
Expected: ~150–200k gas per agreement lifecycle

---

## Phase 4: Agent Registration & RFQ Configuration

### 4.1 Agent Registry (On-chain or Off-chain)
**On-chain registry** (if building broader ecosystem):
- Deploy `AgentRegistry.sol` with agent metadata
- Agents call `registerAgent(address, capability[], endpoint)`
- RFQ engine queries registry to build candidate list

**Off-chain registry** (faster for v1):
- Store agents in environment JSON: `DARK_MATTER_RFQ_COUNTERPARTIES_JSON`
- Format: `[{id, displayName, erc8004Id, capabilities, walletAddress}, ...]`
- Example:
  ```json
  [
    {
      "id": "agent-b",
      "displayName": "Agent B (Testnet)",
      "erc8004Id": "erc8004:bnb:agent-b-testnet-001",
      "capabilities": ["community-raids", "telegram-ops"],
      "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    },
    {
      "id": "agent-c-testnet",
      "displayName": "Agent C (Testnet Cohort)",
      "erc8004Id": "erc8004:bnb:agent-c-testnet-001",
      "capabilities": ["discord-ops", "growth-analytics"],
      "walletAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    }
  ]
  ```

### 4.2 RFQ Weights & Scoring
**Current defaults (inherited from local):**
```typescript
{
  price: 0.35,          // 35% weight on BNB quote
  eta: 0.20,            // 20% weight on response time
  reliability: 0.25,    // 25% weight on agent track record
  capabilityFit: 0.20   // 20% weight on required skills match
}
```

**Testnet tuning options:**
- **Conservative (trust):** Increase reliability weight to 0.35, decrease price to 0.25
- **Cost-optimized:** Increase price weight to 0.45, decrease reliability to 0.15
- **Speed-focused:** Increase eta weight to 0.35, decrease capabilityFit to 0.10

**Action:** Update weights in `runRfqSelection()` call within `cli.ts` orchestrator

### 4.3 Disable Strict Agent B Matching
**For true multi-agent coordination:**
```bash
# .env.testnet
DARK_MATTER_RFQ_STRICT_AGENT_B=false
```
This allows RFQ to select from any registered agent, not just Agent B.

---

## Phase 5: Testing & Validation

### 5.1 Unit & Integration Tests on Testnet
```bash
# Run all tests with testnet configuration
npm run test:testnet -- \
  --env .env.testnet \
  --network bsc-testnet \
  --include-end-to-end
```

**Test suite should validate:**
- ✓ Agreement creation with deterministic settlement contract
- ✓ RFQ selection produces expected winner
- ✓ Agent A & B can approve independently
- ✓ Release succeeds with 2/2 approvals
- ✓ Timeout mechanism works after deadline
- ✓ Operator actions (retry, escalate) execute correctly

### 5.2 Orchestrator Dry-Run
```bash
DRY_RUN=true npm run demo:orchestrate:testnet
```
**Validates:**
- Network connectivity to RPC
- Wallet funding levels
- Contract availability
- RFQ candidate parsing
- Agreement construction (no txs sent)

### 5.3 Live Integration Flow (First Real Agreement)
```bash
# Terminal 1: Agent A loop
npm run agent:a:testnet -- --poll-interval 3000

# Terminal 2: Agent B loop
npm run agent:b:testnet -- --poll-interval 3000

# Terminal 3: Orchestrator (creates agreement)
npm run demo:orchestrate:testnet

# Terminal 4: Monitor state
watch -n 2 'cat /tmp/adm-agent-state.json | jq ".agreements[-1]"'
```

**Expected flow:**
1. Orchestrator logs: `RFQ selected Agent B score=XX.XX quote=X.XX eta=XXm`
2. Orchestrator deploys contract: `contract=0x...`
3. Agent A logs: `Approving 0x...`
4. Agent B logs: `Approving 0x...`
5. Orchestrator logs: `Released 0x...` (contract state = completed)
6. State file shows: `status: "completed", releaseTxHash: "0x..."`

**Duration:** ~30–60 seconds (depending on block times)

---

## Phase 6: UI Integration & Observability

### 6.1 Update Dark Matter UI for Testnet
**File:** `apps/dark-matter-ui/app/api/session/route.ts`

Current behavior:
- Reads local state from `/tmp/adm-agent-state.json`
- Filters to source=local by default

Needed changes:
```typescript
// Support testnet network selection
const networkSource = query.get('network') || 'local'; // 'local', 'bsc-testnet', 'bsc-mainnet'
const stateFile = networkSource === 'local' 
  ? '/tmp/adm-agent-state.json'
  : '/tmp/agentic-dark-matter-transcripts-bsc-testnet.json'; // or cloud-hosted DB

// Append network label to timeline
timelineEvent.detail += ` (${networkSource})`;
```

**Updated UI URLs:**
- Local: `http://127.0.0.1:3006?source=local`
- Testnet: `http://127.0.0.1:3006?source=bsc-testnet&network=97`

### 6.2 Transaction Tracing
**Add explorer links to UI timeline:**
```typescript
// In timeline event detail
if (event.txHash) {
  const chain = networkSource === 'bsc-testnet' ? 'testnet' : '';
  const explorerUrl = `https://${chain}.bscscan.com/tx/${event.txHash}`;
  event.detail += ` [View on Explorer](${explorerUrl})`;
}
```

### 6.3 Real-Time Monitoring Dashboard
**Deploy monitoring service:**
```bash
npm run -w @adm/dark-matter-ui dev:testnet -- \
  --port 3007 \
  --env .env.testnet \
  --network bsc-testnet
```

**Dashboard features:**
- Live agreement pipeline (stages: created → approved → released)
- RFQ winner history with score distribution
- Gas usage trends (avg gas/agreement)
- Agent uptime metrics
- Failed agreement root causes

---

## Phase 7: Multi-Agent Coordination

### 7.1 Bring Additional Agents Online
**Option A: Run Agent C & D locally**
```bash
# Terminal 5: Agent C
DARK_MATTER_AGENT_C_PRIVATE_KEY=0x... npm run agent:c:testnet

# Terminal 6: Agent D
DARK_MATTER_AGENT_D_PRIVATE_KEY=0x... npm run agent:d:testnet
```

**Option B: Coordinate with external agents**
- Share `DARK_MATTER_RFQ_COUNTERPARTIES_JSON` with partner teams
- Partner agents run their own loops pointing to same RPC + state file
- Agents authenticate via wallet signature (verify signer in shared-core)

### 7.2 RFQ Evolution
**v1 (current):** Deterministic seeded scoring → single winner  
**v2 (testnet enhancements):**
- Multi-round RFQ: Get quote from Agent B → if rejected, auto-retry with Agent C
- Competitive bidding: All agents submit bids, select best score
- Fallback chain: If winner doesn't approve in 5 minutes, auto-promote fallback

**Implementation:** Modify `runRfqSelection()` to support async bidding + timeout logic

---

## Phase 8: Production Readiness Checklist

### Pre-Launch Validation
- [ ] All wallets funded with 2+ BNB buffer
- [ ] Contracts deployed & verified on Etherscan
- [ ] Dry-run orchestrator completes without errors
- [ ] Live test agreement (A→B→Release) succeeds
- [ ] UI displays all testnet agreements correctly
- [ ] RFQ selection deterministic & auditable
- [ ] Agent logs are clean (no error stacks)
- [ ] State file persists correctly across restarts
- [ ] Operator actions (retry, escalate) tested

### Monitoring & Alerting
- [ ] Setup logs aggregation (datadog, loki, papertrail)
- [ ] Alert on failed approvals or timeouts
- [ ] Alert on RPC rate limit exhaustion
- [ ] Alert on wallet balance < 0.5 BNB
- [ ] Daily digest of agreement metrics (count, avg gas, success rate)

### Documentation
- [ ] Testnet deployment guide for new team members
- [ ] RFQ scoring rationale & tuning guide
- [ ] Troubleshooting guide (common RPC errors, gas issues, RFQ failures)
- [ ] Agent onboarding kit (wallet setup, env config, testing)

---

## Phase 9: Mainnet Preparation (Future)

### 9.1 Contract Security Audit
- External audit of escrow lifecycle contracts
- Formal verification of settlement state machine
- Fuzz testing for gas edge cases

### 9.2 Mainnet Configuration
- `.env.mainnet` with mainnet RPC + chain ID (56)
- Real asset funding (actual BNB, not testnet)
- Insurance or bonding for settlement disputes

### 9.3 Gradual Rollout
- Phase 1: Pilot with 2 agents, small volume (0.1 BNB/agreement)
- Phase 2: Expand to 5 agents, medium volume (0.5 BNB/agreement)
- Phase 3: Open registry, community agents, full volume

---

## Quick Reference: Commands

```bash
# Bootstrap testnet environment
cp .env.testnet.example .env.testnet
# [Edit .env.testnet with wallet addresses + RPC URL]
npm run build

# Deploy contracts
npm run -w @adm/agent-runtime deploy:contracts -- --env .env.testnet

# Start agents & orchestrator
npm run agent:a:testnet &
npm run agent:b:testnet &
npm run demo:orchestrate:testnet

# Monitor state
watch -n 2 'cat /tmp/adm-agent-state.json | jq'

# Start UI
npm run -w @adm/dark-matter-ui dev -- --env .env.testnet

# View UI
open http://127.0.0.1:3006?source=bsc-testnet
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Testnet RPC downtime** | Use multiple RPC endpoints; implement fallback retry logic |
| **Insufficient wallet funding** | Maintain 5+ BNB buffer per agent; alert at <1 BNB |
| **Failed approvals (gas/nonce)** | Implement exponential backoff; log and retry failed txs |
| **RFQ candidate unresponsive** | Timeout-based fallback (5 min); escalate to operator UI |
| **State file corruption** | Daily backup; implement versioned state snapshots |
| **Agent loop crashes** | PM2 auto-restart; circuit breaker on RPC errors |

---

## Success Metrics

- [ ] First live agreement executes in <2 minutes
- [ ] RFQ selection consistent across runs
- [ ] 95%+ agreement success rate (approved & released)
- [ ] <200k gas per agreement lifecycle
- [ ] UI displays real-time transaction status
- [ ] Zero manual interventions needed for 10+ consecutive agreements

---

**Next Step:** Start with Phase 1 (infrastructure setup). Once wallets are funded and RPC is confirmed, move to Phase 3 (contract deployment). Estimated time to first live agreement: **4 hours**
