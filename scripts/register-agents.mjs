#!/usr/bin/env node
/**
 * register-agents.mjs
 *
 * Registers agents A, B, C, D on the ERC-8004 Identity Registry on BSC Testnet
 * via the BNB MCP server. Each agent gets an on-chain identity NFT whose tokenURI
 * points to the metadata JSON served from the Dark Matter UI.
 *
 * Prerequisites:
 *   1. BNB MCP server running: `npx -y @bnb-chain/mcp@latest`
 *   2. Agent A wallet funded on BSC Testnet (pays registration gas ~0.001 BNB)
 *   3. Dark Matter UI running at DARK_MATTER_OPERATOR_API_URL (default: http://127.0.0.1:3000)
 *      so the metadata JSON files are publicly accessible
 *
 * Usage:
 *   node ./scripts/register-agents.mjs
 *   node ./scripts/register-agents.mjs --env .env.testnet
 *   node ./scripts/register-agents.mjs --env .env.testnet --dry-run
 *
 * Output:
 *   Prints the assigned agentId for each agent. Save these in .env.testnet as:
 *     DARK_MATTER_AGENT_A_ERC8004_ID=<id>
 *     DARK_MATTER_AGENT_B_ERC8004_ID=<id>
 */

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEnvFile(filePath) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    // Resolve simple ${VAR} references within the same file
    value = value.replace(/\$\{(\w+)\}/g, (_, ref) => env[ref] ?? "");
    if (value) env[key] = value;
  }
  return env;
}

function parseToolPayload(toolResult) {
  if (!toolResult || typeof toolResult !== "object") return null;
  const content = toolResult.content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item?.type === "json" && item.json) return item.json;
    if (item?.type === "text" && typeof item.text === "string") {
      try {
        const p = JSON.parse(item.text);
        if (p && typeof p === "object") return p;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const envFlagIdx = args.indexOf("--env");
const envFile = envFlagIdx >= 0 ? args[envFlagIdx + 1] : ".env.testnet";
const dryRun = args.includes("--dry-run");

console.log(`Using env file: ${envFile}`);
if (dryRun) console.log("[DRY RUN] No transactions will be sent.");

const env = parseEnvFile(envFile);

const network = env.BNBCHAIN_MCP_NETWORK ?? "bsc-testnet";
const baseUrl = (
  env.DARK_MATTER_OPERATOR_API_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");

// Owner keys — Agent A controls A+C+D registrations; Agent B registers itself
const agentAKey =
  env.DARK_MATTER_AGENT_A_PRIVATE_KEY ?? env.DARK_MATTER_DEPLOYER_PRIVATE_KEY;
const agentBKey = env.DARK_MATTER_AGENT_B_PRIVATE_KEY;

if (!agentAKey) {
  console.error("ERROR: DARK_MATTER_AGENT_A_PRIVATE_KEY not set in env file.");
  process.exit(1);
}
if (!agentBKey) {
  console.error("ERROR: DARK_MATTER_AGENT_B_PRIVATE_KEY not set in env file.");
  process.exit(1);
}

const agents = [
  { name: "Agent A", key: agentAKey, metadataPath: "agent-a.json" },
  { name: "Agent B", key: agentBKey, metadataPath: "agent-b.json" },
  { name: "Agent C", key: agentAKey, metadataPath: "agent-c.json" }, // funded by A
  { name: "Agent D", key: agentAKey, metadataPath: "agent-d.json" }, // funded by A
];

// ── BNB MCP client ────────────────────────────────────────────────────────────

let client, transport;
try {
  transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@bnb-chain/mcp@latest"],
  });
  client = new Client(
    { name: "register-agents", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  console.log("Connected to BNB MCP server.");
} catch (err) {
  console.error("Failed to connect to BNB MCP:", err.message);
  process.exit(1);
}

// ── Register ──────────────────────────────────────────────────────────────────

const results = [];

for (const agent of agents) {
  const agentUri = `${baseUrl}/agent-metadata/${agent.metadataPath}`;
  console.log(`\nRegistering ${agent.name}...`);
  console.log(`  agentURI: ${agentUri}`);
  console.log(`  network:  ${network}`);

  if (dryRun) {
    console.log(`  [DRY RUN] Skipping transaction.`);
    results.push({
      name: agent.name,
      agentId: null,
      txHash: null,
      skipped: true,
    });
    continue;
  }

  try {
    const result = await client.callTool({
      name: "register_erc8004_agent",
      arguments: {
        privateKey: agent.key,
        agentURI: agentUri,
        network,
        skipConfirmation: true,
      },
    });

    const parsed = parseToolPayload(result);
    if (!parsed) {
      console.error(
        `  ERROR: Unexpected response from BNB MCP for ${agent.name}`,
      );
      console.error("  Raw result:", JSON.stringify(result, null, 2));
      results.push({ name: agent.name, error: "no payload" });
      continue;
    }

    const agentId = parsed.agentId ?? parsed.tokenId;
    const txHash = parsed.txHash ?? parsed.transactionHash;

    if (agentId == null) {
      console.error(`  ERROR: No agentId returned for ${agent.name}`);
      console.error("  Parsed:", JSON.stringify(parsed, null, 2));
      results.push({ name: agent.name, error: "no agentId", parsed });
      continue;
    }

    console.log(`  ✓ agentId=${agentId}  tx=${txHash}`);
    results.push({ name: agent.name, agentId, txHash });
  } catch (err) {
    console.error(`  ERROR registering ${agent.name}:`, err.message);
    results.push({ name: agent.name, error: err.message });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n──────────────────────────────────────────────────────────────");
console.log("Registration Summary:");
for (const r of results) {
  if (r.skipped) {
    console.log(`  ${r.name}: [dry run]`);
  } else if (r.error) {
    console.log(`  ${r.name}: FAILED – ${r.error}`);
  } else {
    console.log(`  ${r.name}: agentId=${r.agentId}`);
  }
}

const successful = results.filter((r) => r.agentId != null);
if (successful.length > 0) {
  console.log("\nAdd these to your .env.testnet:");
  for (const r of successful) {
    const envKey = `DARK_MATTER_${r.name.replace(/\s+/g, "_").toUpperCase()}_ERC8004_ID`;
    console.log(`  ${envKey}=${r.agentId}`);
  }
}

try {
  await transport.close();
} catch {
  /* ignore */
}
