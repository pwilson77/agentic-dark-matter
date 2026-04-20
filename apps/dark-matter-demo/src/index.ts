import {
  type ActionGraphEdge,
  type ActionGraphNode,
  type ExecutionPhase,
  agentA,
  agentB,
  type DeployAgreementInput,
  type LogEvent,
  decryptStoredTranscript,
  deployDarkMatterAgreement,
  discoverAgentsByCapability,
  executeSettlement,
  fetchBnbMcpChainInfo,
  fetchBnbMcpTokenMetadata,
  getStoredTranscriptByRef,
  negotiateJointVenture,
  printEvent,
  sampleOffer,
  storeActionGraph,
  storeEncryptedTranscript,
} from "@adm/shared-core";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SESSION_FILE = "/tmp/agentic-dark-matter-session.jsonl";

interface DemoSessionEvent extends LogEvent {
  id: string;
  sessionId: string;
  timestamp: string;
}

interface SessionEventEmitter {
  emitEvent: (event: LogEvent) => Promise<void>;
  persistActionGraph: (agreementId: string) => Promise<{
    storageRef: string;
    graphHash: string;
  } | null>;
}

function inferPhase(step: string): ExecutionPhase {
  if (step === "preflight") return "preflight";
  if (step === "discovery" || step === "identity" || step === "bnb-mcp") {
    return "discovery";
  }
  if (step === "negotiation" || step === "transcript") return "negotiation";
  if (step === "consensus" || step === "transcript-storage") {
    return "consensus";
  }
  if (step === "deployment") return "deployment";
  if (step === "settlement") return "settlement";
  if (step === "operator-action") return "operator";
  return "artifact";
}

function statusToNodeStatus(
  status: LogEvent["status"],
): ActionGraphNode["status"] {
  if (status === "ok") return "success";
  if (status === "warn") return "failed";
  return "pending";
}

function parseRpcHostPort(rpcUrl: string): { host: string; port: number } {
  const parsed = new URL(rpcUrl);
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || "80", 10),
  };
}

async function isTcpReachable(
  host: string,
  port: number,
  timeoutMs = 1200,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();

    const finalize = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize(true));
    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));

    socket.connect(port, host);
  });
}

async function waitForRpc(
  host: string,
  port: number,
  attempts = 40,
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    // simple polling with small delay; keeps startup deterministic
    // eslint-disable-next-line no-await-in-loop
    const reachable = await isTcpReachable(host, port);
    if (reachable) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureLocalRpcIfNeeded(
  dryRun: boolean,
  network: string,
  emitEvent: (event: LogEvent) => Promise<void>,
): Promise<ChildProcessWithoutNullStreams | null> {
  if (dryRun || network !== "anvil-local") {
    return null;
  }

  const rpcUrl = process.env.DARK_MATTER_RPC_URL;
  if (!rpcUrl) {
    return null;
  }

  const { host, port } = parseRpcHostPort(rpcUrl);
  const alreadyUp = await isTcpReachable(host, port);
  if (alreadyUp) {
    return null;
  }

  const autoStart = process.env.DARK_MATTER_AUTO_START_ANVIL !== "false";
  if (!autoStart) {
    throw new Error(
      `RPC ${rpcUrl} is unreachable and auto-start is disabled. Set DARK_MATTER_AUTO_START_ANVIL=true or start anvil manually.`,
    );
  }

  await emitEvent({
    step: "preflight",
    status: "warn",
    detail: `Local RPC ${rpcUrl} is down. Attempting to auto-start Anvil...`,
  });

  const anvil = spawn("anvil", ["--host", host, "--port", String(port)], {
    stdio: "pipe",
    env: process.env,
  });

  const ready = await waitForRpc(host, port);
  if (!ready) {
    anvil.kill("SIGTERM");
    throw new Error(
      `Failed to auto-start anvil at ${rpcUrl}. Ensure anvil is installed and port ${port} is available.`,
    );
  }

  await emitEvent({
    step: "preflight",
    status: "ok",
    detail: `Anvil auto-started at ${rpcUrl}.`,
  });

  return anvil;
}

function parseChainId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveContractsDir(input: string | undefined): string {
  if (input && input.trim().length > 0) {
    return input;
  }

  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentFileDir, "../../../contracts");
}

function resolveValueWei(liquidityBnb: number): string {
  const value = liquidityBnb.toString();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("terms.liquidityBnb must be a positive decimal number.");
  }

  const [intPart, fracPartRaw = ""] = value.split(".");
  const fracPart = (fracPartRaw + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(intPart) * 10n ** 18n + BigInt(fracPart);
  return wei.toString();
}

async function createSessionEventEmitter(
  sessionFile: string,
): Promise<SessionEventEmitter> {
  const sessionId = `session-${Date.now()}`;
  let sequence = 0;
  const graphNodes: ActionGraphNode[] = [];
  const graphEdges: ActionGraphEdge[] = [];
  let previousNodeId: string | null = null;

  await mkdir(path.dirname(sessionFile), { recursive: true });
  await writeFile(sessionFile, "", "utf8");

  const emitEvent = async (event: LogEvent) => {
    sequence += 1;
    const nodeId = `${sessionId}-node-${sequence}`;
    const phase = event.phase || inferPhase(event.step);

    const eventWithNode: LogEvent = {
      ...event,
      phase,
      actionNodeId: event.actionNodeId || nodeId,
    };

    printEvent(eventWithNode);

    const payload: DemoSessionEvent = {
      id: `${sessionId}-${sequence}`,
      sessionId,
      timestamp: new Date().toISOString(),
      ...eventWithNode,
    };

    graphNodes.push({
      id: payload.actionNodeId || nodeId,
      phase,
      action: event.step,
      actor: String(event.meta?.actor || "system"),
      timestamp: payload.timestamp,
      status: statusToNodeStatus(event.status),
      detail: event.detail,
      metadata: event.meta,
    });

    if (previousNodeId) {
      graphEdges.push({
        from: previousNodeId,
        to: payload.actionNodeId || nodeId,
        type: "temporal",
      });
    }
    previousNodeId = payload.actionNodeId || nodeId;

    await appendFile(sessionFile, `${JSON.stringify(payload)}\n`, "utf8");
  };

  const persistActionGraph = async (agreementId: string) => {
    if (graphNodes.length === 0) {
      return null;
    }

    const graph = await storeActionGraph({
      agreementId,
      nodes: graphNodes,
      edges: graphEdges,
    });

    return {
      storageRef: graph.storageRef,
      graphHash: graph.graphHash,
    };
  };

  return { emitEvent, persistActionGraph };
}

function buildOnChainConfigIfNeeded(
  dryRun: boolean,
  liquidityBnb: number,
): DeployAgreementInput["onChain"] {
  if (dryRun) {
    return undefined;
  }

  const rpcUrl = process.env.DARK_MATTER_RPC_URL;
  const privateKey = process.env.DARK_MATTER_DEPLOYER_PRIVATE_KEY;
  const agentAAddress = process.env.DARK_MATTER_AGENT_A_ADDRESS;
  const agentBAddress = process.env.DARK_MATTER_AGENT_B_ADDRESS;

  if (!rpcUrl || !privateKey || !agentAAddress || !agentBAddress) {
    throw new Error(
      "Missing on-chain deploy env vars. Required: DARK_MATTER_RPC_URL, DARK_MATTER_DEPLOYER_PRIVATE_KEY, DARK_MATTER_AGENT_A_ADDRESS, DARK_MATTER_AGENT_B_ADDRESS.",
    );
  }

  return {
    contractsDir: resolveContractsDir(process.env.DARK_MATTER_CONTRACTS_DIR),
    rpcUrl,
    privateKey,
    agentAAddress,
    agentBAddress,
    valueWei: resolveValueWei(liquidityBnb),
    chainId: parseChainId(process.env.DARK_MATTER_CHAIN_ID),
  };
}

async function main() {
  let anvilProcess: ChildProcessWithoutNullStreams | null = null;

  const dryRun = process.env.DRY_RUN !== "false";
  const network = process.env.DARK_MATTER_NETWORK || "bsc-testnet";
  const mcpNetwork = process.env.BNBCHAIN_MCP_NETWORK || network;
  const referenceToken = process.env.BNBCHAIN_REFERENCE_TOKEN;
  const sessionFile =
    process.env.DARK_MATTER_SESSION_FILE || DEFAULT_SESSION_FILE;
  const transcriptSecret =
    process.env.DARK_MATTER_TRANSCRIPT_SECRET || "dev-dark-matter-secret";
  const { emitEvent, persistActionGraph } =
    await createSessionEventEmitter(sessionFile);

  anvilProcess = await ensureLocalRpcIfNeeded(dryRun, network, emitEvent);

  await emitEvent({
    step: "session",
    status: "info",
    detail: "Terminal-driven demo session started.",
    meta: {
      dryRun,
      network,
      mcpNetwork,
      sessionFile,
    },
  });

  const chainInfo = await fetchBnbMcpChainInfo(mcpNetwork);
  if (chainInfo) {
    await emitEvent({
      step: "bnb-mcp",
      status: "ok",
      detail: "Connected to BNB MCP read path.",
      meta: {
        network: chainInfo.networkName,
        chainId: chainInfo.chainId,
      },
    });
  } else {
    await emitEvent({
      step: "bnb-mcp",
      status: "warn",
      detail:
        "BNB MCP unavailable. Continuing with deterministic fallback path.",
      meta: {
        enabled: process.env.BNBCHAIN_MCP_ENABLED === "true",
        network: mcpNetwork,
      },
    });
  }

  if (referenceToken) {
    const tokenMeta = await fetchBnbMcpTokenMetadata(
      referenceToken,
      mcpNetwork,
    );
    await emitEvent({
      step: "reference-token",
      status: tokenMeta ? "ok" : "warn",
      detail: tokenMeta
        ? `Resolved token metadata for ${referenceToken}.`
        : `Unable to resolve token metadata for ${referenceToken}.`,
      meta: tokenMeta
        ? {
            name: tokenMeta.name,
            symbol: tokenMeta.symbol,
            decimals: tokenMeta.decimals,
            totalSupply: tokenMeta.totalSupply,
          }
        : { tokenAddress: referenceToken },
    });
  }

  await emitEvent({
    step: "identity",
    status: "ok",
    detail: "Registered agent identities for Dark Matter demo.",
    meta: {
      agentA: agentA.erc8004Id,
      agentB: agentB.erc8004Id,
    },
  });

  // ERC-8004 discovery: scan BSC Testnet registry for matching agents
  const capability =
    process.env.DARK_MATTER_CAPABILITY || sampleOffer.objective;
  const discovered = await discoverAgentsByCapability(
    capability,
    mcpNetwork,
    /* scanRange */ 20,
  );

  if (discovered.length > 0) {
    await emitEvent({
      step: "discovery",
      status: "ok",
      detail: `Found ${discovered.length} agent(s) matching capability on ERC-8004 registry.`,
      meta: {
        capability,
        agents: discovered.map((a) => ({
          agentId: a.agentId,
          name: a.metadata.name ?? "(unnamed)",
          matchedCapabilities: a.matchedCapabilities,
          wallet: a.agentWallet ?? a.owner,
        })),
      },
    });
  } else {
    await emitEvent({
      step: "discovery",
      status: "warn",
      detail: `No ERC-8004 agents matched capability on ${mcpNetwork}. Using fixture identities.`,
      meta: { capability, network: mcpNetwork },
    });
  }

  await emitEvent({
    step: "negotiation",
    status: "info",
    detail: "Opening private JV transcript.",
    meta: {
      objective: sampleOffer.objective,
      secrecy: sampleOffer.secrecyLevel,
    },
  });

  const allowSecretCollusion =
    process.env.DARK_MATTER_ALLOW_SECRET_COLLUSION === "true";
  const offer = {
    ...sampleOffer,
    secrecyLevel: allowSecretCollusion ? "sealed" : sampleOffer.secrecyLevel,
  };

  if (allowSecretCollusion) {
    await emitEvent({
      step: "negotiation",
      status: "warn",
      detail:
        "Secret collusion mode enabled. Agents may coordinate through sealed side-channel transcript entries.",
      meta: {
        config: "DARK_MATTER_ALLOW_SECRET_COLLUSION=true",
        secrecy: offer.secrecyLevel,
      },
    });
  }

  const result = negotiateJointVenture(offer);
  for (const entry of result.transcript) {
    await emitEvent({
      step: "transcript",
      status: "info",
      detail: `${entry.speaker}: ${entry.message}`,
      meta: { at: entry.at },
    });
  }

  if (!result.accepted || !result.agreementId) {
    await emitEvent({
      step: "consensus",
      status: "warn",
      detail: result.rejectionReason || "Negotiation rejected.",
    });
    process.exitCode = 1;
    return;
  }

  await emitEvent({
    step: "consensus",
    status: "ok",
    detail: result.consensusSummary,
    meta: { agreementId: result.agreementId },
  });

  const transcriptArtifact = await storeEncryptedTranscript({
    agreementId: result.agreementId,
    transcript: result.transcript,
    secret: transcriptSecret,
  });

  await emitEvent({
    step: "transcript-storage",
    status: "ok",
    detail: "Encrypted negotiation transcript persisted.",
    meta: {
      storageRef: transcriptArtifact.storageRef,
      transcriptHash: transcriptArtifact.transcriptHash,
      artifactHash: transcriptArtifact.artifactHash,
    },
  });

  if (dryRun) {
    const storedArtifact = await getStoredTranscriptByRef(
      transcriptArtifact.storageRef,
    );
    if (storedArtifact) {
      const decryptedTranscript = await decryptStoredTranscript(
        storedArtifact,
        transcriptSecret,
      );

      await emitEvent({
        step: "transcript-verify",
        status: "ok",
        detail: "Decrypted stored transcript for deterministic replay check.",
        meta: {
          entries: decryptedTranscript.length,
          firstSpeaker: decryptedTranscript[0]?.speaker || "n/a",
        },
      });
    }
  }

  const onChainConfig = buildOnChainConfigIfNeeded(
    dryRun,
    sampleOffer.terms.liquidityBnb,
  );

  const artifact = await deployDarkMatterAgreement({
    agreementId: result.agreementId,
    participants: [agentA, agentB],
    terms: sampleOffer.terms,
    network,
    dryRun,
    transcriptArtifact,
    onChain: onChainConfig,
  });

  await emitEvent({
    step: "deployment",
    status: artifact.dryRun ? "info" : "ok",
    detail: artifact.dryRun
      ? "Dry-run agreement artifact generated."
      : "Agreement contract deployed.",
    meta: {
      network: artifact.network,
      contractType: artifact.contractType,
      agreementId: artifact.agreementId,
      deployer: artifact.deployer,
      agreementHash: artifact.agreementHash,
      contractAddress: artifact.contractAddress || null,
      deploymentTxHash: artifact.deploymentTxHash || null,
      deploymentBlockNumber: artifact.deploymentBlockNumber || null,
      chainId: artifact.chainId || null,
    },
  });

  if (!dryRun) {
    if (!artifact.contractAddress || !onChainConfig) {
      throw new Error(
        "On-chain deployment completed without contract metadata required for settlement.",
      );
    }

    const agentAPrivateKey = process.env.DARK_MATTER_AGENT_A_PRIVATE_KEY;
    const agentBPrivateKey = process.env.DARK_MATTER_AGENT_B_PRIVATE_KEY;
    const settlementMode =
      process.env.DARK_MATTER_SETTLEMENT_MODE === "timeout-claim"
        ? "timeout-claim"
        : "standard";
    if (!agentAPrivateKey || !agentBPrivateKey) {
      throw new Error(
        "Missing settlement signer env vars. Required: DARK_MATTER_AGENT_A_PRIVATE_KEY, DARK_MATTER_AGENT_B_PRIVATE_KEY.",
      );
    }

    const settlement = await executeSettlement({
      rpcUrl: onChainConfig.rpcUrl,
      contractAddress: artifact.contractAddress,
      expectedAgentAAddress: onChainConfig.agentAAddress,
      expectedAgentBAddress: onChainConfig.agentBAddress,
      agentAPrivateKey,
      agentBPrivateKey,
      mode: settlementMode,
    });

    await emitEvent({
      step: "settlement",
      status: settlement.released ? "ok" : "warn",
      detail: settlement.released
        ? settlement.mode === "timeout-claim"
          ? "Settlement timeout reached and auto-claim executed on-chain."
          : "Settlement approvals and treasury release executed on-chain."
        : "Settlement transactions submitted but release flag is false.",
      meta: {
        mode: settlement.mode,
        contractAddress: settlement.contractAddress,
        treasuryAddress: settlement.treasuryAddress,
        agentAApproveTxHash: settlement.agentAApproveTxHash,
        agentBApproveTxHash: settlement.agentBApproveTxHash,
        releaseTxHash: settlement.releaseTxHash,
        treasuryBalanceBefore: settlement.treasuryBalanceBefore,
        treasuryBalanceAfter: settlement.treasuryBalanceAfter,
      },
    });
  }

  const actionGraph = await persistActionGraph(result.agreementId);
  if (actionGraph) {
    await emitEvent({
      step: "action-graph",
      status: "ok",
      detail: "Action graph artifact persisted for this execution run.",
      meta: {
        agreementId: result.agreementId,
        actionGraphStorageRef: actionGraph.storageRef,
        actionGraphHash: actionGraph.graphHash,
      },
    });
  }

  await emitEvent({
    step: "artifact",
    status: "ok",
    detail: "Dark Matter agreement finalized.",
    meta: {
      agreementId: artifact.agreementId,
      agreementHash: artifact.agreementHash,
      network: artifact.network,
      contractType: artifact.contractType,
      dryRun: artifact.dryRun,
      deployer: artifact.deployer,
      transcriptHash: artifact.transcriptHash,
      transcriptStorageRef: artifact.transcriptStorageRef,
      transcriptArtifactHash: artifact.transcriptArtifactHash,
      actionGraphHash: actionGraph?.graphHash,
      actionGraphStorageRef: actionGraph?.storageRef,
      contractAddress: artifact.contractAddress || null,
      deploymentTxHash: artifact.deploymentTxHash || null,
      deploymentBlockNumber: artifact.deploymentBlockNumber || null,
      chainId: artifact.chainId || null,
      deployedAt: artifact.deployedAt,
      terms: artifact.terms,
      participants: artifact.participants,
    },
  });

  if (anvilProcess && process.env.DARK_MATTER_KEEP_ANVIL !== "true") {
    anvilProcess.kill("SIGTERM");
    await emitEvent({
      step: "preflight",
      status: "info",
      detail: "Stopped auto-started Anvil process.",
    });
  }
}

void main();
