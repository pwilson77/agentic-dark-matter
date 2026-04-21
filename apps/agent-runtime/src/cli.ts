import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEther } from "ethers";
import {
  approveSettlementViaMcp,
  createAgreementViaMcp,
  negotiateJointVenture,
  releaseViaMcp,
  runRfqSelection,
  storeEncryptedTranscript,
} from "@adm/shared-core";
import type { AgentIdentity } from "@adm/shared-core";

type AgentRole = "coordinator" | "executor";

interface AgentConfig {
  agentId: string;
  displayName: string;
  erc8004Id: string;
  role: AgentRole;
  capabilities: string[];
  wallet: {
    address: string;
    privateKeyEnv: string;
  };
  network: {
    rpcUrl: string;
    chainId: number;
  };
  behavior?: {
    pollIntervalMs?: number;
  };
}

interface AgreementStateRecord {
  agreementId: string;
  contractAddress: string;
  agentA: string;
  agentB: string;
  status: "deployed" | "completed" | "failed";
  approvals: string[];
  approveTxHashes: Record<string, string>;
  releaseTxHash: string | null;
  createdAt: string;
  meta?: Record<string, unknown>;
}

interface RuntimeState {
  agreements: AgreementStateRecord[];
}

const DEFAULT_STATE_FILE = "/tmp/adm-agent-state.json";
const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_TREASURY = "0x1111222233334444555566667777888899990000";

function buildDefaultRfqCandidates(agentBAddress: string): AgentIdentity[] {
  return [
    {
      id: "agent-b",
      displayName: "Agent B",
      erc8004Id: "erc8004:bnb:agent-b-001",
      capabilities: ["community-raids", "telegram-ops"],
      walletAddress: agentBAddress,
    },
    {
      id: "agent-c",
      displayName: "Agent C",
      erc8004Id: "erc8004:bnb:agent-c-001",
      capabilities: ["community-raids", "discord-ops"],
      walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    },
    {
      id: "agent-d",
      displayName: "Agent D",
      erc8004Id: "erc8004:bnb:agent-d-001",
      capabilities: ["community-raids", "telegram-ops", "growth-analytics"],
      walletAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    },
  ];
}

function parseRfqCandidatesFromEnv(
  envValue: string | undefined,
  fallback: AgentIdentity[],
): AgentIdentity[] {
  if (!envValue) return fallback;
  try {
    const parsed = JSON.parse(envValue) as AgentIdentity[];
    if (!Array.isArray(parsed)) return fallback;
    const usable = parsed.filter(
      (item) =>
        !!item &&
        typeof item.id === "string" &&
        typeof item.displayName === "string" &&
        typeof item.erc8004Id === "string" &&
        Array.isArray(item.capabilities),
    );
    return usable.length > 0 ? usable : fallback;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function log(scope: string, message: string): void {
  console.log(`[${scope}] [${nowIso()}] ${message}`);
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const value =
      argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(key, value);
    if (value !== "true") i += 1;
  }
  return args;
}

function getStateFile(): string {
  return process.env.AGENT_STATE_FILE || DEFAULT_STATE_FILE;
}

async function readState(): Promise<RuntimeState> {
  const stateFile = getStateFile();
  if (!existsSync(stateFile)) return { agreements: [] };
  try {
    return JSON.parse(await readFile(stateFile, "utf8")) as RuntimeState;
  } catch {
    return { agreements: [] };
  }
}

async function writeState(state: RuntimeState): Promise<void> {
  const stateFile = getStateFile();
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
}

async function loadAgentConfig(configPath: string): Promise<AgentConfig> {
  const resolved = path.resolve(process.cwd(), configPath);
  const raw = await readFile(resolved, "utf8");
  // Expand ${ENV_VAR} placeholders so testnet configs can reference env values.
  const expanded = raw.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
  return JSON.parse(expanded) as AgentConfig;
}

function getPrivateKeyFromEnv(config: AgentConfig): string {
  const envName = config.wallet.privateKeyEnv;
  const value = process.env[envName];
  if (!value) {
    throw new Error(
      `Missing ${envName}. Set it before starting ${config.agentId}.`,
    );
  }
  return value;
}

async function processAgreements(
  config: AgentConfig,
  privateKey: string,
): Promise<void> {
  const state = await readState();
  const myAddress = config.wallet.address.toLowerCase();
  let changed = false;

  for (const agreement of state.agreements) {
    if (agreement.status === "completed" || agreement.status === "failed")
      continue;

    const isParticipant =
      agreement.agentA.toLowerCase() === myAddress ||
      agreement.agentB.toLowerCase() === myAddress;
    if (!isParticipant) continue;

    const hasApproved = agreement.approvals
      .map((x) => x.toLowerCase())
      .includes(myAddress);

    if (!hasApproved && agreement.status === "deployed") {
      try {
        log(config.agentId, `Approving ${agreement.contractAddress}`);
        const approval = await approveSettlementViaMcp({
          rpcUrl: config.network.rpcUrl,
          contractAddress: agreement.contractAddress,
          signerPrivateKey: privateKey,
        });
        agreement.approvals.push(myAddress);
        agreement.approveTxHashes[myAddress] = approval.txHash;
        changed = true;
        log(config.agentId, `Approved. tx=${approval.txHash}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(config.agentId, `Approve error: ${msg}`);
      }
    }

    if (
      config.role === "coordinator" &&
      agreement.approvals.length >= 2 &&
      !agreement.releaseTxHash
    ) {
      try {
        log(config.agentId, `Releasing ${agreement.contractAddress}`);
        const release = await releaseViaMcp({
          rpcUrl: config.network.rpcUrl,
          contractAddress: agreement.contractAddress,
          signerPrivateKey: privateKey,
        });
        agreement.releaseTxHash = release.txHash;
        agreement.status = "completed";
        changed = true;
        log(config.agentId, `Released. tx=${release.txHash}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.toLowerCase().includes("already released")) {
          agreement.status = "completed";
          changed = true;
          log(config.agentId, `Release already reflected on-chain.`);
        } else {
          log(config.agentId, `Release error: ${msg}`);
        }
      }
    }
  }

  if (changed) {
    await writeState(state);
  }
}

async function runAgent(configPath: string): Promise<void> {
  const config = await loadAgentConfig(configPath);
  const privateKey = getPrivateKeyFromEnv(config);
  const pollMs = config.behavior?.pollIntervalMs ?? 3000;

  log(
    config.agentId,
    `Started role=${config.role} wallet=${config.wallet.address}`,
  );
  log(config.agentId, `Polling ${getStateFile()} every ${pollMs}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processAgreements(config, privateKey).catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      log(config.agentId, `Loop error: ${msg}`);
    });

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function runOrchestrator(): Promise<void> {
  const rpcUrl = process.env.DARK_MATTER_RPC_URL || DEFAULT_RPC_URL;
  const chainId = Number.parseInt(
    process.env.DARK_MATTER_CHAIN_ID || String(DEFAULT_CHAIN_ID),
    10,
  );
  const contractsDir =
    process.env.DARK_MATTER_CONTRACTS_DIR ||
    path.resolve(process.cwd(), "contracts");
  const deployerKey =
    process.env.DARK_MATTER_DEPLOYER_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const agentAAddress =
    process.env.DARK_MATTER_AGENT_A_ADDRESS ||
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const agentBAddress =
    process.env.DARK_MATTER_AGENT_B_ADDRESS ||
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const transcriptSecret =
    process.env.DARK_MATTER_TRANSCRIPT_SECRET || "dev-dark-matter-secret";
  const liquidityBnb = Number.parseFloat(
    process.env.DARK_MATTER_LIQUIDITY_BNB || "0.05",
  );
  const networkLabel =
    process.env.DARK_MATTER_NETWORK || "anvil-local";

  const rfqCandidates = parseRfqCandidatesFromEnv(
    process.env.DARK_MATTER_RFQ_COUNTERPARTIES_JSON,
    buildDefaultRfqCandidates(agentBAddress),
  );

  const strictWalletMatch =
    (process.env.DARK_MATTER_RFQ_STRICT_AGENT_B || "true").toLowerCase() !==
    "false";
  const eligibleCandidates = strictWalletMatch
    ? rfqCandidates.filter(
        (candidate) =>
          !candidate.walletAddress ||
          candidate.walletAddress.toLowerCase() === agentBAddress.toLowerCase(),
      )
    : rfqCandidates;
  const effectiveCandidates =
    eligibleCandidates.length > 0
      ? eligibleCandidates
      : buildDefaultRfqCandidates(agentBAddress).filter(
          (candidate) => candidate.id === "agent-b",
        );

  const rfq = runRfqSelection({
    objective:
      "Select counterparty for coordinated liquidity and growth operations",
    requiredCapabilities: ["community-raids", "telegram-ops"],
    maxQuoteBnb: liquidityBnb * 2,
    maxEtaMinutes: 60,
    candidates: effectiveCandidates,
  });

  log(
    "orchestrator",
    `RFQ selected ${rfq.selected.candidate.displayName} score=${rfq.selected.score} quote=${rfq.selected.quoteBnb} eta=${rfq.selected.etaMinutes}m`,
  );
  if (rfq.fallback) {
    log(
      "orchestrator",
      `RFQ fallback ${rfq.fallback.candidate.displayName} score=${rfq.fallback.score}`,
    );
  }

  const selectedCounterparty = rfq.selected.candidate;

  const offer = {
    proposer: {
      id: "agent-a",
      displayName: "Agent A",
      erc8004Id: "erc8004:bnb:agent-a-001",
      capabilities: ["liquidity-provision"],
    },
    counterparty: selectedCounterparty,
    objective:
      "Launch coordinated liquidity and growth JV without exposing terms publicly before execution.",
    secrecyLevel: "private" as const,
    terms: {
      liquidityBnb,
      raidCoverageHours: 24,
      revenueShareBpsAgentA: 6000,
      revenueShareBpsAgentB: 4000,
      treasuryAddress: DEFAULT_TREASURY,
      notes: "Agent runtime orchestrated agreement",
    },
  };

  const negotiated = negotiateJointVenture(offer);
  if (!negotiated.accepted || !negotiated.agreementId) {
    throw new Error(negotiated.rejectionReason || "Negotiation rejected");
  }

  log("orchestrator", `Accepted agreementId=${negotiated.agreementId}`);

  const transcript = await storeEncryptedTranscript({
    agreementId: negotiated.agreementId,
    transcript: negotiated.transcript,
    secret: transcriptSecret,
  });

  const agreement = await createAgreementViaMcp({
    agreementId: negotiated.agreementId,
    participants: [offer.proposer, offer.counterparty],
    terms: offer.terms,
    network: networkLabel,
    dryRun: false,
    transcriptArtifact: transcript,
    onChain: {
      contractsDir,
      rpcUrl,
      privateKey: deployerKey,
      agentAAddress,
      agentBAddress,
      valueWei: parseEther(String(offer.terms.liquidityBnb)).toString(),
      chainId,
    },
  });

  const state = await readState();
  state.agreements.push({
    agreementId: negotiated.agreementId,
    contractAddress: String(agreement.contractAddress || ""),
    agentA: agentAAddress,
    agentB: agentBAddress,
    status: "deployed",
    approvals: [],
    approveTxHashes: {},
    releaseTxHash: null,
    createdAt: nowIso(),
    meta: {
      agreementHash: agreement.agreementHash,
      transcriptHash: transcript.transcriptHash,
      rfq: {
        selected: {
          id: rfq.selected.candidate.id,
          displayName: rfq.selected.candidate.displayName,
          score: rfq.selected.score,
          quoteBnb: rfq.selected.quoteBnb,
          etaMinutes: rfq.selected.etaMinutes,
        },
        fallback: rfq.fallback
          ? {
              id: rfq.fallback.candidate.id,
              displayName: rfq.fallback.candidate.displayName,
              score: rfq.fallback.score,
            }
          : null,
        bids: rfq.bids.map((bid) => ({
          id: bid.candidate.id,
          displayName: bid.candidate.displayName,
          score: bid.score,
          quoteBnb: bid.quoteBnb,
          etaMinutes: bid.etaMinutes,
          reliability: bid.reliability,
          capabilityFit: bid.capabilityFit,
        })),
      },
    },
  });
  await writeState(state);

  log("orchestrator", `Deployed contract=${agreement.contractAddress}`);
  log("orchestrator", `Registered in state file=${getStateFile()}`);
}

async function main(): Promise<void> {
  const [mode] = process.argv.slice(2);
  const args = parseArgs(process.argv.slice(2));

  if (mode === "agent") {
    const configPath = args.get("config");
    if (!configPath) {
      throw new Error("Usage: node dist/cli.js agent --config <path>");
    }
    await runAgent(configPath);
    return;
  }

  if (mode === "orchestrate") {
    await runOrchestrator();
    return;
  }

  throw new Error(
    "Usage: node dist/cli.js <agent|orchestrate> [--config <path>]",
  );
}

void main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[agent-runtime] Fatal: ${msg}`);
  process.exit(1);
});
