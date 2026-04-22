import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseEther } from "ethers";
import {
  approveSettlementViaMcp,
  createAgreementViaMcp,
  negotiateJointVenture,
  releaseViaMcp,
  storeEncryptedTranscript,
} from "@adm/shared-core";
import type { AgentIdentity } from "@adm/shared-core";

type AgentRole = "coordinator" | "executor";

interface AgentPersona {
  systemPrompt?: string;
  style?: string;
  goals?: string[];
}

interface AgentConfig {
  agentId: string;
  displayName: string;
  erc8004Id: string;
  role: AgentRole;
  capabilities: string[];
  persona?: AgentPersona;
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
    acceptedCapabilities?: string[];
  };
}

interface DeliveryProof {
  submittedBy: string;
  submittedAt: string;
  summary: string;
  evidence: string[];
  proofHash: string;
}

interface BidRecord {
  bidId: string;
  agentId: string;
  agentDisplayName: string;
  agentAddress: string;
  erc8004Id: string;
  capabilities: string[];
  quoteBnb: number;
  etaMinutes: number;
  rationale: string;
  submittedAt: string;
}

interface RfqRequestRecord {
  rfqId: string;
  capability: string;
  secondaryCapabilities: string[];
  objective: string;
  budgetBnb: number;
  maxEtaMinutes: number;
  postedByAgentId: string;
  postedByAddress: string;
  postedAt: string;
  minBids: number;
  status: "open" | "selected" | "cancelled";
  bids: BidRecord[];
  selection?: {
    winnerBidId: string;
    winnerAgentId: string;
    winnerAddress: string;
    reasoning: string;
    decidedAt: string;
  };
  agreementId?: string;
}

interface AgreementStateRecord {
  agreementId: string;
  contractAddress: string;
  deployTxHash: string | null;
  deployBlockNumber: number | null;
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
  rfqRequests: RfqRequestRecord[];
  agreements: AgreementStateRecord[];
}

const DEFAULT_STATE_FILE = "/tmp/adm-agent-state.json";
const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_TREASURY = "0x1111222233334444555566667777888899990000";

function nowIso(): string {
  return new Date().toISOString();
}

function log(scope: string, message: string): void {
  const at = nowIso();
  console.log(`[${scope}] [${at}] ${message}`);
  // Best-effort append to a JSONL file so the UI can tail it.
  const logFile = process.env.AGENT_LOG_FILE || "/tmp/adm-agent-logs.jsonl";
  try {
    const line = JSON.stringify({ at, scope, message }) + "\n";
    // Fire-and-forget; use sync append to preserve ordering and avoid races.
    // Small messages only, so the cost is negligible.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("node:fs").appendFileSync(logFile, line);
  } catch {
    // ignore — logging must never crash the agent
  }
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
  if (!existsSync(stateFile)) return { rfqRequests: [], agreements: [] };
  try {
    const parsed = JSON.parse(
      await readFile(stateFile, "utf8"),
    ) as Partial<RuntimeState>;
    return {
      rfqRequests: Array.isArray(parsed.rfqRequests) ? parsed.rfqRequests : [],
      agreements: Array.isArray(parsed.agreements) ? parsed.agreements : [],
    };
  } catch {
    return { rfqRequests: [], agreements: [] };
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
  const expanded = raw.replace(
    /\$\{([^}]+)\}/g,
    (_, key) => process.env[key] ?? "",
  );
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

// ---------- LLM helpers ----------

function isLlmEnabled(): boolean {
  return (
    (process.env.DARK_MATTER_LLM_ENABLED || "false").toLowerCase() === "true" &&
    !!process.env.DARK_MATTER_LLM_API_KEY
  );
}

async function llmChat(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!isLlmEnabled()) {
    throw new Error("LLM not enabled");
  }
  const apiKey = process.env.DARK_MATTER_LLM_API_KEY as string;
  const baseUrl =
    process.env.DARK_MATTER_LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.DARK_MATTER_LLM_MODEL || "gpt-4o-mini";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (process.env.DARK_MATTER_LLM_SITE_URL) {
    headers["HTTP-Referer"] = process.env.DARK_MATTER_LLM_SITE_URL;
  }
  if (process.env.DARK_MATTER_LLM_APP_NAME) {
    headers["X-OpenRouter-Title"] = process.env.DARK_MATTER_LLM_APP_NAME;
  }
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (payload.choices?.[0]?.message?.content || "").trim();
}

// ---------- deterministic fallbacks ----------

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function computeBidTerms(
  config: AgentConfig,
  rfq: RfqRequestRecord,
): { quoteBnb: number; etaMinutes: number; capabilityFit: number } {
  const required = [rfq.capability, ...rfq.secondaryCapabilities].map((c) =>
    c.toLowerCase(),
  );
  const mine = config.capabilities.map((c) => c.toLowerCase());
  const matches = required.filter((r) => mine.includes(r)).length;
  const capabilityFit = required.length
    ? Math.round((matches / required.length) * 100)
    : 100;

  const seed = hashSeed(`${config.agentId}|${rfq.rfqId}`);
  const quoteMin = Math.max(0.05, rfq.budgetBnb * 0.4);
  const quoteMax = Math.max(quoteMin + 0.1, rfq.budgetBnb * 1.05);
  const quoteRatio = (seed % 700) / 699;
  const quoteBnb = Number(
    (quoteMin + (quoteMax - quoteMin) * quoteRatio).toFixed(3),
  );

  const etaMin = 8;
  const etaMax = Math.max(etaMin + 1, Math.floor(rfq.maxEtaMinutes * 1.1));
  const etaMinutes = etaMin + (seed % (etaMax - etaMin + 1));

  return { quoteBnb, etaMinutes, capabilityFit };
}

function stubBidRationale(
  config: AgentConfig,
  rfq: RfqRequestRecord,
  terms: { quoteBnb: number; etaMinutes: number; capabilityFit: number },
): string {
  const style = config.persona?.style || "concise";
  return `[${style}] ${config.displayName} can deliver ${rfq.capability} work within ${terms.etaMinutes}m for ${terms.quoteBnb} BNB; capability match ${terms.capabilityFit}%.`;
}

// ---------- executor: bid generation ----------

function isCapabilityMatch(
  config: AgentConfig,
  rfq: RfqRequestRecord,
): boolean {
  const required = [rfq.capability, ...rfq.secondaryCapabilities].map((c) =>
    c.toLowerCase(),
  );
  const mine = config.capabilities.map((c) => c.toLowerCase());
  return required.some((r) => mine.includes(r));
}

async function maybeSubmitBid(
  config: AgentConfig,
  rfq: RfqRequestRecord,
): Promise<BidRecord | null> {
  if (rfq.status !== "open") return null;
  const myAddress = config.wallet.address.toLowerCase();
  if (rfq.bids.some((b) => b.agentAddress.toLowerCase() === myAddress))
    return null;
  if (!isCapabilityMatch(config, rfq)) {
    log(
      config.agentId,
      `RFQ ${rfq.rfqId}: capability="${rfq.capability}" not in my set [${config.capabilities.join(", ")}]; skipping.`,
    );
    return null;
  }

  log(
    config.agentId,
    `RFQ ${rfq.rfqId} received. Analyzing: capability="${rfq.capability}" budget=${rfq.budgetBnb} BNB maxEta=${rfq.maxEtaMinutes}m`,
  );

  const terms = computeBidTerms(config, rfq);

  let rationale: string;
  if (isLlmEnabled()) {
    log(config.agentId, `Drafting bid rationale via LLM...`);
    try {
      const systemPrompt =
        config.persona?.systemPrompt ||
        `You are ${config.displayName}. Respond in one short sentence as a pragmatic operator.`;
      const userPrompt = [
        `RFQ capability: ${rfq.capability}`,
        `Secondary capabilities: ${rfq.secondaryCapabilities.join(", ") || "(none)"}`,
        `Objective: ${rfq.objective}`,
        `Budget: ${rfq.budgetBnb} BNB`,
        `Max ETA: ${rfq.maxEtaMinutes} minutes`,
        `My capabilities: ${config.capabilities.join(", ")}`,
        `My quote: ${terms.quoteBnb} BNB`,
        `My ETA: ${terms.etaMinutes} minutes`,
        `Capability match score: ${terms.capabilityFit}%`,
        "",
        "Write one concise sentence explaining why you are a strong choice.",
      ].join("\n");
      rationale = await llmChat(systemPrompt, userPrompt);
      if (!rationale) rationale = stubBidRationale(config, rfq, terms);
    } catch (err) {
      log(
        config.agentId,
        `LLM error while drafting rationale (${String(err)}); using stub.`,
      );
      rationale = stubBidRationale(config, rfq, terms);
    }
  } else {
    rationale = stubBidRationale(config, rfq, terms);
  }

  const bid: BidRecord = {
    bidId: `bid_${randomUUID()}`,
    agentId: config.agentId,
    agentDisplayName: config.displayName,
    agentAddress: config.wallet.address,
    erc8004Id: config.erc8004Id,
    capabilities: config.capabilities,
    quoteBnb: terms.quoteBnb,
    etaMinutes: terms.etaMinutes,
    rationale,
    submittedAt: nowIso(),
  };

  log(
    config.agentId,
    `Submitting bid: quote=${bid.quoteBnb} BNB eta=${bid.etaMinutes}m`,
  );
  log(config.agentId, `Rationale: ${bid.rationale}`);
  return bid;
}

// ---------- coordinator: bid selection ----------

async function maybeSelectWinner(
  config: AgentConfig,
  rfq: RfqRequestRecord,
): Promise<{ winnerBidId: string; reasoning: string } | null> {
  if (rfq.status !== "open") return null;
  const samePosterByAddress =
    rfq.postedByAddress.toLowerCase() === config.wallet.address.toLowerCase();
  const samePosterByAgentId = rfq.postedByAgentId === config.agentId;
  if (!samePosterByAddress && !samePosterByAgentId) return null;
  if (!samePosterByAddress && samePosterByAgentId) {
    log(
      config.agentId,
      `RFQ ${rfq.rfqId}: poster address mismatch (${rfq.postedByAddress} vs ${config.wallet.address}); proceeding via postedByAgentId fallback.`,
    );
  }
  if (rfq.bids.length < rfq.minBids) {
    log(
      config.agentId,
      `RFQ ${rfq.rfqId}: ${rfq.bids.length}/${rfq.minBids} bids received; waiting...`,
    );
    return null;
  }

  log(
    config.agentId,
    `RFQ ${rfq.rfqId}: bid window closed with ${rfq.bids.length} bids. Ranking...`,
  );
  for (const bid of rfq.bids) {
    log(
      config.agentId,
      `  bid ${bid.bidId.slice(0, 12)}… from ${bid.agentDisplayName}: ${bid.quoteBnb} BNB / ${bid.etaMinutes}m — ${bid.rationale}`,
    );
  }

  if (isLlmEnabled()) {
    try {
      const systemPrompt =
        config.persona?.systemPrompt ||
        "You are a cautious coordinator. Return strict JSON {winnerBidId, reasoning}.";
      const userPrompt = [
        `RFQ objective: ${rfq.objective}`,
        `Primary capability: ${rfq.capability}`,
        `Budget: ${rfq.budgetBnb} BNB`,
        `Max ETA: ${rfq.maxEtaMinutes}m`,
        "",
        "Bids:",
        ...rfq.bids.map((b) =>
          JSON.stringify({
            bidId: b.bidId,
            agentId: b.agentId,
            quoteBnb: b.quoteBnb,
            etaMinutes: b.etaMinutes,
            capabilities: b.capabilities,
            rationale: b.rationale,
          }),
        ),
        "",
        'Select the best counterparty. Respond ONLY with strict JSON: {"winnerBidId":"...","reasoning":"one sentence"}.',
      ].join("\n");
      log(config.agentId, `Calling LLM to rank bids...`);
      const raw = await llmChat(systemPrompt, userPrompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          winnerBidId?: string;
          reasoning?: string;
        };
        if (
          parsed.winnerBidId &&
          rfq.bids.find((b) => b.bidId === parsed.winnerBidId)
        ) {
          return {
            winnerBidId: parsed.winnerBidId,
            reasoning: parsed.reasoning || "LLM selection",
          };
        }
      }
      log(
        config.agentId,
        `LLM did not return valid JSON; falling back to score rank.`,
      );
    } catch (err) {
      log(config.agentId, `LLM ranking error: ${String(err)}; falling back.`);
    }
  }

  // Deterministic fallback: score = capabilityFit*0.5 - quote*20 - eta*0.3
  const ranked = [...rfq.bids]
    .map((b) => {
      const required = [rfq.capability, ...rfq.secondaryCapabilities].map((c) =>
        c.toLowerCase(),
      );
      const mine = b.capabilities.map((c) => c.toLowerCase());
      const matches = required.filter((r) => mine.includes(r)).length;
      const capFit = required.length ? matches / required.length : 1;
      const score =
        capFit * 50 -
        (b.quoteBnb / Math.max(0.01, rfq.budgetBnb)) * 20 -
        (b.etaMinutes / Math.max(1, rfq.maxEtaMinutes)) * 10;
      return { bid: b, score };
    })
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  return {
    winnerBidId: winner.bid.bidId,
    reasoning: `Deterministic rank: capability-fit-weighted score ${winner.score.toFixed(2)}, best of ${ranked.length}.`,
  };
}

// ---------- approval / release (existing semantics) ----------

function getDeliveryProof(
  agreement: AgreementStateRecord,
): DeliveryProof | null {
  const proof = (agreement.meta as { deliveryProof?: unknown } | undefined)
    ?.deliveryProof;
  if (!proof || typeof proof !== "object") return null;
  const typed = proof as Partial<DeliveryProof>;
  if (
    typeof typed.submittedBy !== "string" ||
    typeof typed.submittedAt !== "string" ||
    typeof typed.summary !== "string" ||
    !Array.isArray(typed.evidence) ||
    typeof typed.proofHash !== "string"
  ) {
    return null;
  }
  return {
    submittedBy: typed.submittedBy,
    submittedAt: typed.submittedAt,
    summary: typed.summary,
    evidence: typed.evidence,
    proofHash: typed.proofHash,
  };
}

function buildDeliveryProof(
  config: AgentConfig,
  agreement: AgreementStateRecord,
): DeliveryProof {
  const submittedAt = nowIso();
  const summary =
    process.env.DARK_MATTER_EXECUTION_PROOF_SUMMARY ||
    `${config.displayName} marked execution as done for ${agreement.agreementId}`;
  const agreementHash =
    typeof agreement.meta?.agreementHash === "string"
      ? agreement.meta.agreementHash
      : "";
  const transcriptHash =
    typeof agreement.meta?.transcriptHash === "string"
      ? agreement.meta.transcriptHash
      : "";
  const evidence = [
    `agreementId:${agreement.agreementId}`,
    `contractAddress:${agreement.contractAddress}`,
    `submittedBy:${config.wallet.address.toLowerCase()}`,
    `submittedAt:${submittedAt}`,
    agreementHash ? `agreementHash:${agreementHash}` : "",
    transcriptHash ? `transcriptHash:${transcriptHash}` : "",
  ].filter(Boolean);
  const proofHash = createHash("sha256")
    .update(evidence.join("|"), "utf8")
    .digest("hex");
  return {
    submittedBy: config.wallet.address.toLowerCase(),
    submittedAt,
    summary,
    evidence,
    proofHash,
  };
}

async function shouldApproveWithLlm(
  config: AgentConfig,
  agreement: AgreementStateRecord,
): Promise<boolean> {
  if (!isLlmEnabled()) return true;
  const deliveryProof = getDeliveryProof(agreement);
  // Coordinator waits until executor has posted a delivery proof; there is
  // nothing to review yet, so skip silently instead of asking the LLM.
  if (config.role === "coordinator" && !deliveryProof) {
    return false;
  }
  try {
    const systemPrompt =
      config.persona?.systemPrompt ||
      `You are ${config.displayName}, an autonomous agent reviewing an escrow settlement.`;
    const approvalCount = agreement.approvals.length;
    const userPrompt = [
      "You must decide whether to approve settlement for this escrow agreement.",
      "",
      "Respond with STRICT JSON only, no prose, no code fences:",
      '{"decision":"APPROVE"|"REJECT","reason":"one short sentence"}',
      "",
      `agentId=${config.agentId}`,
      `role=${config.role}`,
      `contractAddress=${agreement.contractAddress}`,
      `status=${agreement.status}`,
      `currentApprovals=${approvalCount}`,
      `hasDeliveryProof=${deliveryProof ? "yes" : "no"}`,
      `deliveryProofHash=${deliveryProof?.proofHash ?? ""}`,
      "",
      "Approve if the agreement looks valid and, for coordinators, the executor",
      "has submitted a delivery proof. Reject only if something looks wrong.",
    ].join("\n");
    const content = await llmChat(systemPrompt, userPrompt);
    const upper = content.toUpperCase();
    // Try strict JSON first
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.decision === "string") {
          const decided = parsed.decision.toUpperCase().includes("APPROVE");
          log(
            config.agentId,
            `LLM decision=${parsed.decision} reason="${parsed.reason ?? ""}"`,
          );
          return decided;
        }
      } catch {
        // fall through to heuristic
      }
    }
    // Heuristic fallback: APPROVE appears and precedes REJECT
    const approveIdx = upper.indexOf("APPROVE");
    const rejectIdx = upper.indexOf("REJECT");
    if (approveIdx !== -1 && (rejectIdx === -1 || approveIdx < rejectIdx)) {
      return true;
    }
    return false;
  } catch (err) {
    log(
      config.agentId,
      `LLM approval error: ${String(err)}; defaulting to approve.`,
    );
    return true;
  }
}

// ---------- main agent loop ----------

async function processRfqs(config: AgentConfig): Promise<boolean> {
  const state = await readState();
  let changed = false;

  for (const rfq of state.rfqRequests) {
    if (config.role === "executor") {
      const bid = await maybeSubmitBid(config, rfq);
      if (bid) {
        rfq.bids.push(bid);
        changed = true;
      }
    } else if (config.role === "coordinator") {
      const selection = await maybeSelectWinner(config, rfq);
      if (selection) {
        const winner = rfq.bids.find((b) => b.bidId === selection.winnerBidId);
        if (winner) {
          rfq.selection = {
            winnerBidId: winner.bidId,
            winnerAgentId: winner.agentId,
            winnerAddress: winner.agentAddress,
            reasoning: selection.reasoning,
            decidedAt: nowIso(),
          };
          rfq.status = "selected";
          changed = true;
          log(
            config.agentId,
            `Selected winner: ${winner.agentDisplayName} (${winner.agentAddress}) — ${selection.reasoning}`,
          );
        }
      }
    }
  }

  if (changed) await writeState(state);
  return changed;
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

    if (
      config.role === "executor" &&
      agreement.status === "deployed" &&
      !getDeliveryProof(agreement)
    ) {
      const proof = buildDeliveryProof(config, agreement);
      agreement.meta = {
        ...(agreement.meta || {}),
        deliveryProof: proof,
      };
      changed = true;
      log(
        config.agentId,
        `Submitted delivery proof hash=${proof.proofHash} for ${agreement.contractAddress}`,
      );
    }

    if (!hasApproved && agreement.status === "deployed") {
      try {
        const llmAllowsApproval = await shouldApproveWithLlm(config, agreement);
        if (!llmAllowsApproval) {
          // Coordinator waiting on executor's delivery proof → silent skip.
          if (config.role === "coordinator" && !getDeliveryProof(agreement)) {
            continue;
          }
          log(
            config.agentId,
            `LLM rejected approval for ${agreement.contractAddress}; skipping.`,
          );
          continue;
        }
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
        const proof = getDeliveryProof(agreement);
        if (!proof) {
          log(
            config.agentId,
            `Release blocked for ${agreement.contractAddress}: missing delivery proof.`,
          );
          continue;
        }
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

  if (changed) await writeState(state);
}

async function runAgent(configPath: string): Promise<void> {
  const config = await loadAgentConfig(configPath);
  const privateKey = getPrivateKeyFromEnv(config);
  const pollMs = config.behavior?.pollIntervalMs ?? 3000;

  log(
    config.agentId,
    `Started role=${config.role} wallet=${config.wallet.address}`,
  );
  log(
    config.agentId,
    `Capabilities: [${config.capabilities.join(", ")}]  LLM=${isLlmEnabled() ? "enabled" : "stub"}`,
  );
  if (config.persona?.systemPrompt) {
    log(
      config.agentId,
      `Persona: ${config.persona.systemPrompt.slice(0, 120)}...`,
    );
  }
  log(config.agentId, `Polling ${getStateFile()} every ${pollMs}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processRfqs(config).catch((error) => {
      log(config.agentId, `RFQ loop error: ${String(error)}`);
    });
    await processAgreements(config, privateKey).catch((error) => {
      log(config.agentId, `Agreement loop error: ${String(error)}`);
    });
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// ---------- orchestrator: post RFQ + deploy escrow once selected ----------

async function postRfq(options: {
  capability: string;
  secondaryCapabilities: string[];
  objective: string;
  budgetBnb: number;
  maxEtaMinutes: number;
  postedByAgentId: string;
  postedByAddress: string;
  minBids: number;
}): Promise<string> {
  const rfqId = `rfq_${randomUUID()}`;
  const record: RfqRequestRecord = {
    rfqId,
    capability: options.capability,
    secondaryCapabilities: options.secondaryCapabilities,
    objective: options.objective,
    budgetBnb: options.budgetBnb,
    maxEtaMinutes: options.maxEtaMinutes,
    postedByAgentId: options.postedByAgentId,
    postedByAddress: options.postedByAddress,
    postedAt: nowIso(),
    minBids: options.minBids,
    status: "open",
    bids: [],
  };
  const state = await readState();
  state.rfqRequests.push(record);
  await writeState(state);
  return rfqId;
}

async function waitForSelection(
  rfqId: string,
  timeoutMs: number,
): Promise<RfqRequestRecord> {
  const started = Date.now();
  let lastKnownBids = 0;
  let lastKnownMinBids = 0;
  let lastKnownStatus: RfqRequestRecord["status"] | "missing" = "missing";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const state = await readState();
    const rfq = state.rfqRequests.find((r) => r.rfqId === rfqId);
    if (rfq && rfq.status === "selected" && rfq.selection) {
      return rfq;
    }
    if (rfq) {
      lastKnownBids = rfq.bids.length;
      lastKnownMinBids = rfq.minBids;
      lastKnownStatus = rfq.status;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Timed out waiting for Agent A to select winner for RFQ ${rfqId} (status=${lastKnownStatus}, bids=${lastKnownBids}/${lastKnownMinBids})`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function ensureRpcReachable(rpcUrl: string, timeoutMs = 10000): Promise<void> {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });
      if (response.ok) return;
    } catch {
      // keep retrying until timeout
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `RPC not reachable at ${rpcUrl}. If you started testnet agents (npm run demo:up testnet), use npm run demo:chat:testnet. If running local mode, start npm run demo:up first and wait for anvil to boot.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function markRfqAgreement(
  rfqId: string,
  agreementId: string,
): Promise<void> {
  const state = await readState();
  const rfq = state.rfqRequests.find((r) => r.rfqId === rfqId);
  if (rfq) {
    rfq.agreementId = agreementId;
    await writeState(state);
  }
}

async function runOrchestrator(args: Map<string, string>): Promise<void> {
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
  const transcriptSecret =
    process.env.DARK_MATTER_TRANSCRIPT_SECRET || "dev-dark-matter-secret";
  const networkLabel = process.env.DARK_MATTER_NETWORK || "anvil-local";

  log("orchestrator", `Preflight RPC check: ${rpcUrl} (${networkLabel})`);
  await ensureRpcReachable(rpcUrl);

  const interactive =
    args.get("interactive") === "true" ||
    args.get("i") === "true" ||
    (input.isTTY && !args.has("capability"));

  let capability = args.get("capability") || "community-raids";
  let secondaryRaw = args.get("secondary") || "telegram-ops,discord-ops";
  let objective =
    args.get("objective") ||
    "Coordinate 24h community raid across Telegram and Discord for launch week.";
  let budgetBnb = Number.parseFloat(args.get("budget") || "1");
  let maxEtaMinutes = Number.parseInt(args.get("eta") || "45", 10);
  let minBids = Number.parseInt(args.get("min-bids") || "2", 10);
  const rfqTimeoutMs = Number.parseInt(
    args.get("timeout-ms") || process.env.DARK_MATTER_RFQ_TIMEOUT_MS || "180000",
    10,
  );

  if (interactive) {
    const rl = readline.createInterface({ input, output });
    const ask = async (q: string, def: string): Promise<string> => {
      const answer = (await rl.question(`${q} [${def}]: `)).trim();
      return answer.length > 0 ? answer : def;
    };
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ORCHESTRATOR — post a task to the agent marketplace");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Press Enter to accept the default in [brackets].");
    console.log("");
    objective = await ask("What do you need done?", objective);
    capability = await ask(
      "Primary capability required (e.g. community-raids, telegram-ops, discord-ops, growth-analytics)",
      capability,
    );
    secondaryRaw = await ask(
      "Secondary capabilities (comma-separated, optional)",
      secondaryRaw,
    );
    budgetBnb = Number.parseFloat(
      await ask("Max budget in BNB", String(budgetBnb)),
    );
    maxEtaMinutes = Number.parseInt(
      await ask("Max ETA in minutes", String(maxEtaMinutes)),
      10,
    );
    minBids = Number.parseInt(
      await ask(
        "Minimum bids required before Agent A selects",
        String(minBids),
      ),
      10,
    );
    rl.close();
    console.log("");
  }

  const secondaryCapabilities = secondaryRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  log("orchestrator", `User task intent received:`);
  log("orchestrator", `  capability=${capability}`);
  log(
    "orchestrator",
    `  secondary=${secondaryCapabilities.join(", ") || "(none)"}`,
  );
  log("orchestrator", `  budget=${budgetBnb} BNB  maxEta=${maxEtaMinutes}m`);
  log("orchestrator", `  objective="${objective}"`);
  log("orchestrator", `Posting RFQ on behalf of Agent A (${agentAAddress})...`);

  const rfqId = await postRfq({
    capability,
    secondaryCapabilities,
    objective,
    budgetBnb,
    maxEtaMinutes,
    postedByAgentId: "agent-a",
    postedByAddress: agentAAddress,
    minBids,
  });
  log("orchestrator", `RFQ posted: ${rfqId}`);
  log(
    "orchestrator",
    `Waiting for Agent A to select a winner (min ${minBids} bids, timeout ${rfqTimeoutMs}ms)...`,
  );

  const rfq = await waitForSelection(rfqId, rfqTimeoutMs);
  const selection = rfq.selection!;
  const winnerBid = rfq.bids.find((b) => b.bidId === selection.winnerBidId)!;
  log(
    "orchestrator",
    `Agent A selected ${winnerBid.agentDisplayName} (${winnerBid.agentAddress}).`,
  );
  log("orchestrator", `Rationale: ${selection.reasoning}`);
  log(
    "orchestrator",
    `Negotiating terms: liquidity=${winnerBid.quoteBnb} BNB eta=${winnerBid.etaMinutes}m`,
  );

  const proposer: AgentIdentity = {
    id: "agent-a",
    displayName: "Agent A",
    erc8004Id: "erc8004:bnb:agent-a-001",
    capabilities: ["liquidity-provision"],
    walletAddress: agentAAddress,
  };
  const counterparty: AgentIdentity = {
    id: winnerBid.agentId,
    displayName: winnerBid.agentDisplayName,
    erc8004Id: winnerBid.erc8004Id,
    capabilities: winnerBid.capabilities,
    walletAddress: winnerBid.agentAddress,
  };

  const offer = {
    proposer,
    counterparty,
    objective: rfq.objective,
    secrecyLevel: "private" as const,
    terms: {
      liquidityBnb: winnerBid.quoteBnb,
      raidCoverageHours: Math.max(1, Math.ceil(rfq.maxEtaMinutes / 60)),
      revenueShareBpsAgentA: 6000,
      revenueShareBpsAgentB: 4000,
      treasuryAddress: DEFAULT_TREASURY,
      notes: `Awarded via RFQ ${rfq.rfqId}`,
    },
  };

  const negotiated = negotiateJointVenture(offer);
  if (!negotiated.accepted || !negotiated.agreementId) {
    throw new Error(negotiated.rejectionReason || "Negotiation rejected");
  }
  log(
    "orchestrator",
    `Negotiation accepted: agreementId=${negotiated.agreementId}`,
  );

  const transcript = await storeEncryptedTranscript({
    agreementId: negotiated.agreementId,
    transcript: negotiated.transcript,
    secret: transcriptSecret,
  });

  log("orchestrator", `Deploying escrow contract on ${networkLabel}...`);
  const agreement = await createAgreementViaMcp({
    agreementId: negotiated.agreementId,
    participants: [proposer, counterparty],
    terms: offer.terms,
    network: networkLabel,
    dryRun: false,
    transcriptArtifact: transcript,
    onChain: {
      contractsDir,
      rpcUrl,
      privateKey: deployerKey,
      agentAAddress,
      agentBAddress: winnerBid.agentAddress,
      valueWei: parseEther(String(offer.terms.liquidityBnb)).toString(),
      chainId,
    },
  });

  const state = await readState();
  state.agreements.push({
    agreementId: negotiated.agreementId,
    contractAddress: String(agreement.contractAddress || ""),
    deployTxHash: agreement.deploymentTxHash
      ? String(agreement.deploymentTxHash)
      : null,
    deployBlockNumber:
      typeof agreement.deploymentBlockNumber === "number"
        ? agreement.deploymentBlockNumber
        : null,
    agentA: agentAAddress,
    agentB: winnerBid.agentAddress,
    status: "deployed",
    approvals: [],
    approveTxHashes: {},
    releaseTxHash: null,
    createdAt: nowIso(),
    meta: {
      agreementHash: agreement.agreementHash,
      transcriptHash: transcript.transcriptHash,
      rfqId: rfq.rfqId,
      winner: {
        agentId: winnerBid.agentId,
        displayName: winnerBid.agentDisplayName,
        reasoning: selection.reasoning,
        quoteBnb: winnerBid.quoteBnb,
        etaMinutes: winnerBid.etaMinutes,
      },
      bids: rfq.bids.map((b) => ({
        agentId: b.agentId,
        quoteBnb: b.quoteBnb,
        etaMinutes: b.etaMinutes,
        rationale: b.rationale,
      })),
    },
  });
  await writeState(state);
  await markRfqAgreement(rfq.rfqId, negotiated.agreementId);

  log("orchestrator", `Escrow deployed at ${agreement.contractAddress}`);
  log(
    "orchestrator",
    `Handing off to Agent A and ${winnerBid.agentDisplayName} for approval + release.`,
  );
  log(
    "orchestrator",
    `Monitor state file ${getStateFile()} or watch the agent terminals for DEMO COMPLETE.`,
  );
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

  if (mode === "orchestrate" || mode === "post-task") {
    await runOrchestrator(args);
    return;
  }

  throw new Error(
    "Usage: node dist/cli.js <agent|orchestrate|post-task> [--config <path>] [--capability X] [--budget N] [--eta N] [--min-bids N]",
  );
}

void main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[agent-runtime] Fatal: ${msg}`);
  process.exit(1);
});
