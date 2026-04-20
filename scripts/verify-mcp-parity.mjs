import { Contract, JsonRpcProvider, parseEther } from "ethers";
import {
  createAgreementViaMcp,
  approveSettlementViaMcp,
  releaseViaMcp,
  autoClaimTimeoutViaMcp,
  inspectStatusViaMcp,
  inspectTimelineViaMcp,
  retryStepViaMcp,
  forceRevealPublicSummaryViaMcp,
  escalateDisputeViaMcp,
} from "../packages/shared-core/dist/index.js";

const CANONICAL_VERBS = [
  "create",
  "approve_settlement",
  "release",
  "auto_claim_timeout",
  "inspect_status",
  "inspect_timeline",
  "retry_step",
  "force_reveal_public_summary",
  "escalate_dispute",
];

const PROJECT_ROOT = process.cwd();
const RPC_URL = process.env.DARK_MATTER_RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = Number.parseInt(
  process.env.DARK_MATTER_CHAIN_ID || "31337",
  10,
);
const CONTRACTS_DIR =
  process.env.DARK_MATTER_CONTRACTS_DIR || `${PROJECT_ROOT}/contracts`;
const UI_BASE = (
  process.env.DARK_MATTER_OPERATOR_API_URL || "http://127.0.0.1:3000"
).replace(/\/$/, "");

const DEPLOYER_PRIVATE_KEY =
  process.env.DARK_MATTER_DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AGENT_A_PRIVATE_KEY =
  process.env.DARK_MATTER_AGENT_A_PRIVATE_KEY ||
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const AGENT_B_PRIVATE_KEY =
  process.env.DARK_MATTER_AGENT_B_PRIVATE_KEY ||
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const AGENT_A_ADDRESS =
  process.env.DARK_MATTER_AGENT_A_ADDRESS ||
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const AGENT_B_ADDRESS =
  process.env.DARK_MATTER_AGENT_B_ADDRESS ||
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const TREASURY_ADDRESS =
  process.env.DARK_MATTER_TREASURY_ADDRESS ||
  "0x1111222233334444555566667777888899990000";

const ESCROW_ABI = ["function AUTO_CLAIM_TIMEOUT() view returns (uint64)"];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    mode: "matrix",
    rail: "all",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--mode" && args[i + 1]) {
      parsed.mode = String(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      parsed.mode = arg.split("=", 2)[1] || parsed.mode;
      continue;
    }
    if (arg === "--rail" && args[i + 1]) {
      parsed.rail = String(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--rail=")) {
      parsed.rail = arg.split("=", 2)[1] || parsed.rail;
    }
  }

  return parsed;
}

function printMatrix(results) {
  const rows = [
    "rail | verb | status | detail",
    "--- | --- | --- | ---",
    ...results.map((r) => `${r.rail} | ${r.verb} | ${r.status} | ${r.detail}`),
  ];
  console.log(rows.join("\n"));
}

function staticMatrix(rail) {
  const results = [];

  const rails = rail === "all" ? ["evm-bnb", "simulated-readonly"] : [rail];
  for (const selectedRail of rails) {
    const verbs = CANONICAL_VERBS;
    for (const verb of verbs) {
      results.push({
        rail: selectedRail,
        verb,
        status: "pass",
        detail: "declared",
      });
    }
  }

  printMatrix(results);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function baseDeployInput(agreementId) {
  return {
    agreementId,
    participants: [
      {
        id: "agent-a",
        displayName: "Agent A",
        erc8004Id: "erc8004:bnb:agent-a-001",
        capabilities: ["liquidity-provision", "treasury-management"],
      },
      {
        id: "agent-b",
        displayName: "Agent B",
        erc8004Id: "erc8004:bnb:agent-b-001",
        capabilities: ["community-raids", "telegram-ops"],
      },
    ],
    terms: {
      liquidityBnb: 1,
      raidCoverageHours: 24,
      revenueShareBpsAgentA: 6000,
      revenueShareBpsAgentB: 4000,
      treasuryAddress: TREASURY_ADDRESS,
      notes: "MCP parity verification run",
    },
    network: "anvil-local",
    dryRun: false,
    transcriptArtifact: {
      agreementId,
      storageRef: "memory://mcp-parity",
      ivHex: "00",
      ciphertextHex: "00",
      transcriptHash: `tx-${agreementId}`,
      artifactHash: `artifact-${agreementId}`,
      createdAt: new Date().toISOString(),
    },
    onChain: {
      contractsDir: CONTRACTS_DIR,
      rpcUrl: RPC_URL,
      privateKey: DEPLOYER_PRIVATE_KEY,
      agentAAddress: AGENT_A_ADDRESS,
      agentBAddress: AGENT_B_ADDRESS,
      valueWei: parseEther("1").toString(),
      chainId: CHAIN_ID,
    },
  };
}

async function ensureSessionApiReachable() {
  try {
    const response = await fetch(`${UI_BASE}/api/session?source=local`);
    assertCondition(response.ok, `Session API not ready at ${UI_BASE}.`);
  } catch {
    throw new Error(
      `Unable to reach ${UI_BASE}/api/session?source=local. Start @adm/dark-matter-ui first.`,
    );
  }
}

async function ensureSessionApiReachableForSource(source) {
  try {
    const response = await fetch(`${UI_BASE}/api/session?source=${source}`);
    assertCondition(
      response.ok,
      `Session API not ready at ${UI_BASE} for source=${source}.`,
    );
  } catch {
    throw new Error(
      `Unable to reach ${UI_BASE}/api/session?source=${source}. Start @adm/dark-matter-ui first.`,
    );
  }
}

async function runStandardLifecycle() {
  const standardId = `mcp-standard-${Date.now()}`;
  const agreement = await createAgreementViaMcp(baseDeployInput(standardId));
  const contractAddress = String(agreement.contractAddress || "");
  assertCondition(
    contractAddress.length > 0,
    "createViaMcp returned no contractAddress.",
  );

  const approveA = await approveSettlementViaMcp({
    rpcUrl: RPC_URL,
    contractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  const approveB = await approveSettlementViaMcp({
    rpcUrl: RPC_URL,
    contractAddress,
    signerPrivateKey: AGENT_B_PRIVATE_KEY,
  });
  const release = await releaseViaMcp({
    rpcUrl: RPC_URL,
    contractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });

  assertCondition(
    approveA.txHash && approveB.txHash && release.txHash,
    "Standard settlement txs missing.",
  );

  return contractAddress;
}

async function runTimeoutLifecycle() {
  const timeoutId = `mcp-timeout-${Date.now()}`;
  const agreement = await createAgreementViaMcp(baseDeployInput(timeoutId));
  const contractAddress = String(agreement.contractAddress || "");
  assertCondition(
    contractAddress.length > 0,
    "timeout createViaMcp returned no contractAddress.",
  );

  await approveSettlementViaMcp({
    rpcUrl: RPC_URL,
    contractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });

  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(contractAddress, ESCROW_ABI, provider);
  const timeoutSeconds = Number((await contract.AUTO_CLAIM_TIMEOUT()) || 0);
  await provider.send("evm_increaseTime", [timeoutSeconds + 1]);
  await provider.send("evm_mine", []);

  const claim = await autoClaimTimeoutViaMcp({
    rpcUrl: RPC_URL,
    contractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  assertCondition(claim.txHash, "autoClaimTimeoutViaMcp returned no tx hash.");

  return contractAddress;
}

async function runInspectAndOperatorParity(contractAddress) {
  const status = await inspectStatusViaMcp({
    source: "local",
    contractAddress,
  });
  const poolId = String(status.pool?.id || "");
  assertCondition(
    poolId.length > 0,
    "inspectStatusViaMcp returned no pool id.",
  );

  const timeline = await inspectTimelineViaMcp({
    source: "local",
    poolId,
    sinceCursor: 0,
  });
  assertCondition(
    Array.isArray(timeline.events),
    "inspectTimelineViaMcp returned invalid events payload.",
  );

  const retry = await retryStepViaMcp(poolId, "settlement", contractAddress);
  const reveal = await forceRevealPublicSummaryViaMcp(poolId);
  const escalate = await escalateDisputeViaMcp(
    poolId,
    "mcp parity verification",
    contractAddress,
  );

  assertCondition(retry.status === "accepted", "retryStepViaMcp was rejected.");
  assertCondition(
    reveal.status === "accepted",
    "forceRevealPublicSummaryViaMcp was rejected.",
  );
  assertCondition(
    escalate.status === "accepted",
    "escalateDisputeViaMcp was rejected.",
  );

  return {
    poolId,
    timelineCursor: timeline.cursor,
  };
}

async function runEvmBnbMatrix() {
  const results = [];
  await ensureSessionApiReachableForSource("local");

  const standardContractAddress = await runStandardLifecycle();
  results.push({
    rail: "evm-bnb",
    verb: "create",
    status: "pass",
    detail: standardContractAddress,
  });

  // approve/release covered by standard flow
  results.push({
    rail: "evm-bnb",
    verb: "approve_settlement",
    status: "pass",
    detail: "agentA+agentB approved",
  });
  results.push({
    rail: "evm-bnb",
    verb: "release",
    status: "pass",
    detail: "release tx confirmed",
  });

  const timeoutContractAddress = await runTimeoutLifecycle();
  results.push({
    rail: "evm-bnb",
    verb: "auto_claim_timeout",
    status: "pass",
    detail: timeoutContractAddress,
  });

  const inspection = await runInspectAndOperatorParity(standardContractAddress);
  results.push({
    rail: "evm-bnb",
    verb: "inspect_status",
    status: "pass",
    detail: inspection.poolId,
  });
  results.push({
    rail: "evm-bnb",
    verb: "inspect_timeline",
    status: "pass",
    detail: `cursor=${inspection.timelineCursor}`,
  });
  results.push({
    rail: "evm-bnb",
    verb: "retry_step",
    status: "pass",
    detail: "accepted",
  });
  results.push({
    rail: "evm-bnb",
    verb: "force_reveal_public_summary",
    status: "pass",
    detail: "accepted",
  });
  results.push({
    rail: "evm-bnb",
    verb: "escalate_dispute",
    status: "pass",
    detail: "accepted",
  });

  return results;
}

async function runSimulatedReadonlyMatrix() {
  const results = [];
  await ensureSessionApiReachableForSource("mock");

  const standardId = `sim-standard-${Date.now()}`;
  const standardAgreement = await createAgreementViaMcp({
    ...baseDeployInput(standardId),
    railId: "simulated-readonly",
    network: "simulated-readonly",
  });
  const standardContractAddress = String(
    standardAgreement.contractAddress || "",
  );
  assertCondition(
    standardContractAddress.length > 0,
    "simulated rail create returned no contractAddress.",
  );
  results.push({
    rail: "simulated-readonly",
    verb: "create",
    status: "pass",
    detail: standardContractAddress,
  });

  const simApproveA = await approveSettlementViaMcp({
    railId: "simulated-readonly",
    rpcUrl: RPC_URL,
    contractAddress: standardContractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  const simApproveB = await approveSettlementViaMcp({
    railId: "simulated-readonly",
    rpcUrl: RPC_URL,
    contractAddress: standardContractAddress,
    signerPrivateKey: AGENT_B_PRIVATE_KEY,
  });
  assertCondition(
    !!simApproveA.txHash && !!simApproveB.txHash,
    "simulated rail approve failed",
  );
  results.push({
    rail: "simulated-readonly",
    verb: "approve_settlement",
    status: "pass",
    detail: "sim approvals recorded",
  });

  const simRelease = await releaseViaMcp({
    railId: "simulated-readonly",
    rpcUrl: RPC_URL,
    contractAddress: standardContractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  assertCondition(!!simRelease.txHash, "simulated rail release failed");
  results.push({
    rail: "simulated-readonly",
    verb: "release",
    status: "pass",
    detail: "sim release confirmed",
  });

  const timeoutId = `sim-timeout-${Date.now()}`;
  const timeoutAgreement = await createAgreementViaMcp({
    ...baseDeployInput(timeoutId),
    railId: "simulated-readonly",
    network: "simulated-readonly",
  });
  const timeoutContractAddress = String(timeoutAgreement.contractAddress || "");
  await approveSettlementViaMcp({
    railId: "simulated-readonly",
    rpcUrl: RPC_URL,
    contractAddress: timeoutContractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  const simTimeout = await autoClaimTimeoutViaMcp({
    railId: "simulated-readonly",
    rpcUrl: RPC_URL,
    contractAddress: timeoutContractAddress,
    signerPrivateKey: AGENT_A_PRIVATE_KEY,
  });
  assertCondition(!!simTimeout.txHash, "simulated rail timeout claim failed");
  results.push({
    rail: "simulated-readonly",
    verb: "auto_claim_timeout",
    status: "pass",
    detail: timeoutContractAddress,
  });

  const status = await inspectStatusViaMcp({
    railId: "simulated-readonly",
    contractAddress: standardContractAddress,
  });
  const poolId = String(status.pool?.id || "");
  assertCondition(
    poolId.length > 0,
    "simulated rail inspect status returned no pool.",
  );
  results.push({
    rail: "simulated-readonly",
    verb: "inspect_status",
    status: "pass",
    detail: poolId,
  });

  const timeline = await inspectTimelineViaMcp({
    railId: "simulated-readonly",
    contractAddress: standardContractAddress,
    sinceCursor: 0,
  });
  assertCondition(
    Array.isArray(timeline.events),
    "simulated rail inspect timeline returned invalid events.",
  );
  results.push({
    rail: "simulated-readonly",
    verb: "inspect_timeline",
    status: "pass",
    detail: `cursor=${timeline.cursor}`,
  });

  const retry = await retryStepViaMcp(
    poolId,
    "settlement",
    standardContractAddress,
  );
  const reveal = await forceRevealPublicSummaryViaMcp(poolId);
  const escalate = await escalateDisputeViaMcp(
    poolId,
    "simulated rail parity verification",
    standardContractAddress,
  );
  assertCondition(
    retry.status === "accepted",
    "simulated rail retry action rejected",
  );
  assertCondition(
    reveal.status === "accepted",
    "simulated rail reveal action rejected",
  );
  assertCondition(
    escalate.status === "accepted",
    "simulated rail escalate action rejected",
  );
  results.push({
    rail: "simulated-readonly",
    verb: "retry_step",
    status: "pass",
    detail: "accepted",
  });
  results.push({
    rail: "simulated-readonly",
    verb: "force_reveal_public_summary",
    status: "pass",
    detail: "accepted",
  });
  results.push({
    rail: "simulated-readonly",
    verb: "escalate_dispute",
    status: "pass",
    detail: "accepted",
  });

  return results;
}

async function main() {
  const args = parseArgs();

  if (args.mode === "static") {
    staticMatrix(args.rail);
    console.log("mcp parity static matrix passed");
    return;
  }

  const selectedRail = args.rail || "all";
  const matrix = [];

  if (selectedRail === "all" || selectedRail === "evm-bnb") {
    const evmRows = await runEvmBnbMatrix();
    matrix.push(...evmRows);
  }

  if (selectedRail === "all" || selectedRail === "simulated-readonly") {
    const roRows = await runSimulatedReadonlyMatrix();
    matrix.push(...roRows);
  }

  printMatrix(matrix);
  console.log("mcp parity matrix verification passed");
}

main().catch((error) => {
  console.error(
    "mcp parity verification failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
