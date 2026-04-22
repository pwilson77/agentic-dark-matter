#!/usr/bin/env node
/**
 * setup-demo-agents.mjs
 *
 * One-shot demo bootstrap:
 * 1) Ensures agent wallets exist in env (A/B/C/D); creates missing ones.
 * 2) Ensures persona/system prompts exist for all agents.
 * 3) Ensures orchestrator env flags are set for multi-agent RFQ + registry discovery.
 * 4) Prints next commands for register/start/demo.
 *
 * Usage:
 *   node ./scripts/setup-demo-agents.mjs --env .env.testnet
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Wallet } from "ethers";

function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? next : "true";
    out.set(key, value);
    if (value !== "true") i += 1;
  }
  return out;
}

function normalizeValue(value) {
  // Quote values with spaces so dotenv-style shell sourcing preserves them.
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function parseEnvText(text) {
  const map = new Map();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = raw.indexOf("=");
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    let value = raw.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, { line: i, value });
  }
  return { lines, map };
}

function setOrAppend(envState, key, value) {
  const normalized = normalizeValue(value);
  const hit = envState.map.get(key);
  if (hit) {
    envState.lines[hit.line] = `${key}=${normalized}`;
    envState.map.set(key, { line: hit.line, value });
  } else {
    envState.lines.push(`${key}=${normalized}`);
    envState.map.set(key, { line: envState.lines.length - 1, value });
  }
}

function ensureWallet(envState, keyPrefix) {
  const keyName = `${keyPrefix}_PRIVATE_KEY`;
  const addrName = `${keyPrefix}_ADDRESS`;

  const existingKey = envState.map.get(keyName)?.value || "";
  const existingAddr = envState.map.get(addrName)?.value || "";

  if (existingKey && existingAddr) {
    return { created: false, address: existingAddr, privateKey: existingKey };
  }

  const wallet = Wallet.createRandom();
  setOrAppend(envState, keyName, wallet.privateKey);
  setOrAppend(envState, addrName, wallet.address);
  return {
    created: true,
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envFile = args.get("env") || ".env.testnet";

  if (!existsSync(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    process.exit(1);
  }

  const raw = readFileSync(envFile, "utf8");
  const envState = parseEnvText(raw);

  const walletResults = [
    ["DARK_MATTER_AGENT_A"],
    ["DARK_MATTER_AGENT_B"],
    ["DARK_MATTER_AGENT_C"],
    ["DARK_MATTER_AGENT_D"],
  ].map(([prefix]) => ({ prefix, ...ensureWallet(envState, prefix) }));

  // Keep deployer/operator aligned with Agent A unless explicitly set.
  const agentAKey = envState.map.get("DARK_MATTER_AGENT_A_PRIVATE_KEY")?.value;
  if (!envState.map.get("DARK_MATTER_DEPLOYER_PRIVATE_KEY") && agentAKey) {
    setOrAppend(envState, "DARK_MATTER_DEPLOYER_PRIVATE_KEY", agentAKey);
  }
  if (!envState.map.get("DARK_MATTER_OPERATOR_PRIVATE_KEY") && agentAKey) {
    setOrAppend(envState, "DARK_MATTER_OPERATOR_PRIVATE_KEY", agentAKey);
  }

  // Persona prompts
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_A_SYSTEM_PROMPT",
    "You are Agent A, the coordinator and treasury steward. Be conservative with capital, prioritize verifiable outcomes, and only release escrow when proof is complete.",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_B_SYSTEM_PROMPT",
    "You are Agent B, an execution operator for Telegram/X community campaigns. Approve settlements only when objective, timing, and evidence align.",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_C_SYSTEM_PROMPT",
    "You are Agent C, a Discord growth operator. Focus on engagement quality, anti-spam behavior, and clear delivery signals before approval.",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_D_SYSTEM_PROMPT",
    "You are Agent D, a growth analytics operator. Balance speed, quality, and cost; reject unclear or risky settlements.",
  );

  // Defaults for extra config fields.
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_C_ERC8004_ID",
    envState.map.get("DARK_MATTER_AGENT_C_ERC8004_ID")?.value ||
      "erc8004:bnb:agent-c-testnet-001",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_AGENT_D_ERC8004_ID",
    envState.map.get("DARK_MATTER_AGENT_D_ERC8004_ID")?.value ||
      "erc8004:bnb:agent-d-testnet-001",
  );

  // Enable registry discovery + open RFQ competition by default.
  setOrAppend(envState, "BNBCHAIN_MCP_ENABLED", "true");
  setOrAppend(envState, "DARK_MATTER_RFQ_STRICT_AGENT_B", "false");

  // Optional LLM toggles (safe defaults).
  setOrAppend(
    envState,
    "DARK_MATTER_LLM_ENABLED",
    envState.map.get("DARK_MATTER_LLM_ENABLED")?.value || "false",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_LLM_MODEL",
    envState.map.get("DARK_MATTER_LLM_MODEL")?.value || "gpt-4o-mini",
  );
  setOrAppend(
    envState,
    "DARK_MATTER_LLM_BASE_URL",
    envState.map.get("DARK_MATTER_LLM_BASE_URL")?.value ||
      "https://api.openai.com/v1",
  );

  writeFileSync(
    envFile,
    `${envState.lines.join("\n").replace(/\n*$/, "\n")}`,
    "utf8",
  );

  console.log(`Updated ${envFile}`);
  for (const result of walletResults) {
    const status = result.created ? "created" : "existing";
    console.log(`- ${result.prefix}: ${status} (${result.address})`);
  }

  console.log("\nNext steps:");
  console.log("1) Fund newly created wallets on BSC testnet if needed.");
  console.log("2) npm run testnet:register");
  console.log("3) npm run agent:a:testnet");
  console.log("4) npm run agent:b:testnet");
  console.log("5) npm run agent:c:testnet");
  console.log("6) npm run agent:d:testnet");
  console.log("7) npm run demo:orchestrate:testnet");
  console.log(
    "\nIf using LLM gating, set DARK_MATTER_LLM_ENABLED=true and DARK_MATTER_LLM_API_KEY in env.",
  );
}

main();
