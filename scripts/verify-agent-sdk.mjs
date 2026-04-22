import { Contract, JsonRpcProvider, parseEther } from "ethers";
import { AgentSdkClient } from "../packages/agent-sdk/dist/index.js";

const RPC_URL = process.env.DARK_MATTER_RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = Number.parseInt(
  process.env.DARK_MATTER_CHAIN_ID || "31337",
  10,
);
const PROJECT_ROOT = process.cwd();
const CONTRACTS_DIR =
  process.env.DARK_MATTER_CONTRACTS_DIR || `${PROJECT_ROOT}/contracts`;

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

const ESCROW_READ_ABI = [
  "function released() view returns (bool)",
  "function treasury() view returns (address)",
];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCreateInput() {
  const agreementId = `sdk-standard-${Date.now()}`;
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
      notes: "Agent SDK integration verification",
    },
    network: "anvil-local",
    dryRun: false,
    transcriptArtifact: {
      agreementId,
      storageRef: "memory://sdk-verify",
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

async function run() {
  const client = new AgentSdkClient({
    rpcUrl: RPC_URL,
    railId: "evm-bnb",
    source: "local",
  });

  const lifecycle = await client.runStandardLifecycle({
    createInput: makeCreateInput(),
    agentAPrivateKey: AGENT_A_PRIVATE_KEY,
    agentBPrivateKey: AGENT_B_PRIVATE_KEY,
    deliveryProofHash: `0x${"cd".repeat(32)}`,
  });

  const contractAddress = String(lifecycle.agreement.contractAddress || "");
  assertCondition(
    /^0x[a-fA-F0-9]{40}$/.test(contractAddress),
    "SDK createAgreement produced invalid contract address",
  );
  assertCondition(
    !!lifecycle.approveA.txHash && !!lifecycle.approveB.txHash,
    "SDK approvals missing tx hashes",
  );
  assertCondition(
    !!lifecycle.submitProof.txHash,
    "SDK submitDeliveryProof missing tx hash",
  );
  assertCondition(!!lifecycle.release.txHash, "SDK release missing tx hash");

  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(contractAddress, ESCROW_READ_ABI, provider);
  const [released, treasury] = await Promise.all([
    contract.released(),
    contract.treasury(),
  ]);

  assertCondition(released === true, "On-chain released flag is false");
  assertCondition(
    String(treasury).toLowerCase() === TREASURY_ADDRESS.toLowerCase(),
    "On-chain treasury does not match expected treasury",
  );

  console.log("agent-sdk verification passed");
  console.log(
    JSON.stringify(
      {
        contractAddress,
        approveATx: lifecycle.approveA.txHash,
        submitProofTx: lifecycle.submitProof.txHash,
        approveBTx: lifecycle.approveB.txHash,
        releaseTx: lifecycle.release.txHash,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("agent-sdk verification failed:", message);
  process.exit(1);
});
