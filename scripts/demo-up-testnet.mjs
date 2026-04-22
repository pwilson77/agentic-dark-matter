#!/usr/bin/env node
/**
 * demo-up-testnet.mjs
 *
 * BNB testnet (Chapel, chainId=97) variant of demo-up.mjs.
 * Launches Agents A/B/C against BSC testnet in a single terminal with
 * interleaved, colored, prefixed logs.
 *
 * Requires:
 *   - .env.testnet with DARK_MATTER_RPC_URL/CHAIN_ID/NETWORK
 *   - funded wallets for A, B, C (see scripts/fund-testnet-agents.mjs)
 *
 * Usage: node ./scripts/demo-up-testnet.mjs
 * Ctrl+C once shuts them all down.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

// ---- load full .env.testnet ----
const envFile = path.join(ROOT, ".env.testnet");
if (!existsSync(envFile)) {
  console.error(
    `[demo-up-testnet] ${envFile} not found. Copy .env.testnet.example and fill in your keys.`,
  );
  process.exit(1);
}
const fileEnv = {};
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  const [, k, rawV] = m;
  fileEnv[k] = rawV.replace(/^['"]|['"]$/g, "");
}

// ---- required vars ----
const REQUIRED = [
  "DARK_MATTER_RPC_URL",
  "DARK_MATTER_CHAIN_ID",
  "DARK_MATTER_NETWORK",
  "DARK_MATTER_DEPLOYER_PRIVATE_KEY",
  "DARK_MATTER_AGENT_A_PRIVATE_KEY",
  "DARK_MATTER_AGENT_A_ADDRESS",
  "DARK_MATTER_AGENT_B_PRIVATE_KEY",
  "DARK_MATTER_AGENT_B_ADDRESS",
  "DARK_MATTER_AGENT_C_PRIVATE_KEY",
  "DARK_MATTER_AGENT_C_ADDRESS",
];
const missing = REQUIRED.filter((k) => !fileEnv[k]);
if (missing.length > 0) {
  console.error(
    `[demo-up-testnet] missing required .env.testnet vars:\n  - ${missing.join("\n  - ")}`,
  );
  console.error(
    `\nAgent C is new — see .env.testnet.example for DARK_MATTER_AGENT_C_* entries.`,
  );
  process.exit(1);
}

// Clear stale state + logs + old session transcript file so the UI reflects this run
const stateFile = "/tmp/adm-agent-state.json";
const logFile = "/tmp/adm-agent-logs.jsonl";
const sessionFile = "/tmp/agentic-dark-matter-session.jsonl";
for (const f of [stateFile, logFile, sessionFile]) {
  if (existsSync(f)) {
    unlinkSync(f);
    console.log(`[demo-up-testnet] cleared stale ${f}`);
  }
}

// ---- colors ----
const COLORS = {
  "agent-a": "\x1b[36m",
  "agent-b": "\x1b[33m",
  "agent-c": "\x1b[35m",
  demo: "\x1b[32m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function prefix(name) {
  const pad = name.padEnd(9);
  const color = COLORS[name] || "";
  return `${color}${BOLD}[${pad}]${RESET}${color}`;
}

function pipe(name, stream) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    process.stdout.write(`${prefix(name)} ${line}${RESET}\n`);
  });
}

const children = [];
function launch(name, cmd, args, extraEnv = {}) {
  const env = {
    ...process.env,
    ...fileEnv,
    ...extraEnv,
  };
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe(name, child.stdout);
  pipe(name, child.stderr);
  child.on("exit", (code, signal) => {
    process.stdout.write(
      `${prefix(name)} exited code=${code} signal=${signal ?? "-"}${RESET}\n`,
    );
  });
  children.push({ name, child });
  return child;
}

async function waitForRpc(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log(
    `${prefix("demo")} Agentic Dark Matter — testnet demo up (chainId=${fileEnv.DARK_MATTER_CHAIN_ID})${RESET}`,
  );
  console.log(`${prefix("demo")} RPC: ${fileEnv.DARK_MATTER_RPC_URL}${RESET}`);
  console.log(
    `${prefix("demo")} LLM ${fileEnv.DARK_MATTER_LLM_API_KEY ? "enabled" : "disabled"}${RESET}`,
  );

  const ok = await waitForRpc(fileEnv.DARK_MATTER_RPC_URL, 10000);
  if (!ok) {
    console.error(
      `${prefix("demo")} could not reach RPC ${fileEnv.DARK_MATTER_RPC_URL}${RESET}`,
    );
    process.exit(1);
  }
  console.log(`${prefix("demo")} RPC reachable${RESET}`);

  const node = process.execPath;
  const cliEntry = path.join(ROOT, "apps/agent-runtime/dist/cli.js");
  if (!existsSync(cliEntry)) {
    console.error(
      `${prefix("demo")} ${cliEntry} not found — run: npm --workspace @adm/agent-runtime run build${RESET}`,
    );
    process.exit(1);
  }

  launch("agent-a", node, [
    cliEntry,
    "agent",
    "--config",
    "./agents/agent-a/config.testnet.json",
  ]);
  launch("agent-b", node, [
    cliEntry,
    "agent",
    "--config",
    "./agents/agent-b/config.testnet.json",
  ]);
  launch("agent-c", node, [
    cliEntry,
    "agent",
    "--config",
    "./agents/agent-c/config.testnet.json",
  ]);

  console.log(
    `${prefix("demo")} agents up on BNB testnet. In another terminal run: ${BOLD}npm run demo:chat:testnet${RESET}`,
  );
  console.log(`${prefix("demo")} Ctrl+C to stop everything${RESET}`);
}

function shutdown(code = 0) {
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => {
  console.log(`\n${prefix("demo")} shutting down...${RESET}`);
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));

main().catch((err) => {
  console.error(err);
  shutdown(1);
});
