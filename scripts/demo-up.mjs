#!/usr/bin/env node
/**
 * Unified demo launcher for anvil-local or BNB testnet.
 *
 * Usage:
 *   npm run demo:up                 # launches anvil locally + agents A/B/C
 *   npm run demo:up testnet         # launches agents A/B/C against BNB testnet
 *   npm run demo:up --no-llm        # anvil, but with LLM disabled
 *   npm run demo:up testnet --no-llm # testnet, but with LLM disabled
 *
 * Ctrl+C once shuts everything down.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const argv = process.argv.slice(2);

// Detect mode: 'testnet' or 'anvil-local' (default)
const USE_TESTNET = argv.includes("testnet") || argv.includes("--testnet");
const SKIP_LLM = argv.includes("--no-llm");
const SKIP_ANVIL = USE_TESTNET; // Skip anvil if testnet mode

// ---- load env: if testnet, load full .env.testnet; else load LLM vars only ----
const llmEnv = {};
const fullEnv = {};
const envFile = path.join(ROOT, ".env.testnet");

if (USE_TESTNET) {
  if (!existsSync(envFile)) {
    console.error(
      `[demo-up] ${envFile} not found. Copy .env.testnet.example and fill in your keys.`,
    );
    process.exit(1);
  }
  // Load full .env.testnet
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, rawV] = m;
    const v = rawV.replace(/^['"]|['"]$/g, "");
    fullEnv[k] = v;
    if (k.startsWith("DARK_MATTER_LLM_") || k === "DARK_MATTER_TRANSCRIPT_SECRET") {
      llmEnv[k] = v;
    }
  }
  // Resolve ${VAR} placeholders within .env values (supports chained refs).
  const resolvePlaceholders = (value, depth = 0) => {
    if (typeof value !== "string" || depth > 5) return value;
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => fullEnv[key] ?? process.env[key] ?? "");
  };
  for (const key of Object.keys(fullEnv)) {
    let current = fullEnv[key];
    for (let i = 0; i < 5; i += 1) {
      const next = resolvePlaceholders(current, i + 1);
      if (next === current) break;
      current = next;
    }
    fullEnv[key] = current;
    if (key.startsWith("DARK_MATTER_LLM_") || key === "DARK_MATTER_TRANSCRIPT_SECRET") {
      llmEnv[key] = current;
    }
  }
  // Validate required testnet vars
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
  const missing = REQUIRED.filter((k) => !fullEnv[k]);
  if (missing.length > 0) {
    console.error(
      `[demo-up] missing required .env.testnet vars:\n  - ${missing.join("\n  - ")}`,
    );
    console.error(
      `\nAgent C is required — see .env.testnet.example for DARK_MATTER_AGENT_C_* entries.`,
    );
    process.exit(1);
  }
} else {
  // Anvil mode: load LLM vars only
  if (!SKIP_LLM && existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, rawV] = m;
      if (
        k.startsWith("DARK_MATTER_LLM_") ||
        k === "DARK_MATTER_TRANSCRIPT_SECRET"
      ) {
        llmEnv[k] = rawV.replace(/^['"]|['"]$/g, "");
      }
    }
  }
}

// Clear stale state + logs + old session transcript file
const stateFile = "/tmp/adm-agent-state.json";
const logFile = "/tmp/adm-agent-logs.jsonl";
const sessionFile = "/tmp/agentic-dark-matter-session.jsonl";
for (const f of [stateFile, logFile, sessionFile]) {
  if (existsSync(f)) {
    unlinkSync(f);
    console.log(
      `[demo-up] cleared stale ${f}`,
    );
  }
}

// Determine network config
const NETWORK_MODE = USE_TESTNET ? "testnet" : "anvil-local";
const BASE_RPC_URL = USE_TESTNET
  ? fullEnv.DARK_MATTER_RPC_URL
  : "http://127.0.0.1:8545";
let RPC_URL = BASE_RPC_URL;
const CHAIN_ID = USE_TESTNET ? fullEnv.DARK_MATTER_CHAIN_ID : "31337";

const BSC_TESTNET_FALLBACK_RPCS = [
  "https://bsc-testnet-dataseed.bnbchain.org",
  "https://bsc-testnet.bnbchain.org",
  "https://bsc-prebsc-dataseed.bnbchain.org",
];

// ---- colors ----
const COLORS = {
  anvil: "\x1b[90m", // gray
  "agent-a": "\x1b[36m", // cyan
  "agent-b": "\x1b[33m", // yellow
  "agent-c": "\x1b[35m", // magenta
  demo: "\x1b[32m", // green
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
    ...llmEnv,
    ...(USE_TESTNET ? fullEnv : {}), // Include all testnet vars if testnet mode
    DARK_MATTER_RPC_URL: RPC_URL,
    DARK_MATTER_CHAIN_ID: CHAIN_ID,
    DARK_MATTER_NETWORK: NETWORK_MODE,
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

// ---- wait for RPC (anvil or testnet) ----
async function waitForRpc(rpcUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(rpcUrl, {
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
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function uniqueRpcList(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const part of value.split(",")) {
      const url = part.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

async function pickReachableRpc(candidates, timeoutMs = 5000) {
  for (const candidate of candidates) {
    const ok = await waitForRpc(candidate, timeoutMs);
    if (ok) return candidate;
  }
  return null;
}

// ---- orchestrate startup ----
async function main() {
  const modeLabel = USE_TESTNET
    ? "BNB testnet (Chapel)"
    : "local anvil";
  console.log(
    `${prefix("demo")} Agentic Dark Matter — demo up (${modeLabel})${RESET}`,
  );
  console.log(
    `${prefix("demo")} LLM ${Object.keys(llmEnv).some((k) => k.includes("API_KEY")) ? "enabled (keys loaded from .env.testnet)" : "disabled (no keys found)"}${RESET}`,
  );

  if (!SKIP_ANVIL && !USE_TESTNET) {
    launch("anvil", "sh", [
      "-c",
      'export PATH="$HOME/.foundry/bin:$PATH" && cd contracts && anvil --host 127.0.0.1 --port 8545 --silent',
    ]);
    console.log(
      `${prefix("demo")} waiting for anvil on http://127.0.0.1:8545 ...${RESET}`,
    );
  }

  if (USE_TESTNET) {
    const candidates = uniqueRpcList([
      BASE_RPC_URL,
      process.env.DARK_MATTER_RPC_URL || "",
      ...BSC_TESTNET_FALLBACK_RPCS,
    ]);
    const selected = await pickReachableRpc(candidates, 4500);
    if (!selected) {
      console.error(
        `${prefix("demo")} no reachable testnet RPC from: ${candidates.join(", ")}${RESET}`,
      );
      shutdown(1);
      return;
    }
    RPC_URL = selected;
    fullEnv.DARK_MATTER_RPC_URL = selected;
    console.log(`${prefix("demo")} selected testnet RPC: ${RPC_URL}${RESET}`);
  }

  const ok = await waitForRpc(RPC_URL, USE_TESTNET ? 5000 : 15000);
  if (!ok) {
    console.error(
      `${prefix("demo")} RPC not reachable at ${RPC_URL}; aborting${RESET}`,
    );
    shutdown(1);
    return;
  }
  console.log(`${prefix("demo")} RPC ready (${NETWORK_MODE})${RESET}`);

  const node = process.execPath;
  const cliEntry = path.join(ROOT, "apps/agent-runtime/dist/cli.js");
  if (!existsSync(cliEntry)) {
    console.error(
      `${prefix("demo")} ${cliEntry} not found — run: npm --workspace @adm/agent-runtime run build${RESET}`,
    );
    process.exit(1);
  }

  // Agent keys: use from fullEnv if testnet, else use hardcoded anvil keys
  const agentAKey = USE_TESTNET
    ? fullEnv.DARK_MATTER_AGENT_A_PRIVATE_KEY
    : "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const agentBKey = USE_TESTNET
    ? fullEnv.DARK_MATTER_AGENT_B_PRIVATE_KEY
    : "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
  const agentCKey = USE_TESTNET
    ? fullEnv.DARK_MATTER_AGENT_C_PRIVATE_KEY
    : "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

  const configDir = USE_TESTNET ? "config.testnet.json" : "config.json";

  launch(
    "agent-a",
    node,
    [cliEntry, "agent", "--config", `./agents/agent-a/${configDir}`],
    {
      AGENT_A_PRIVATE_KEY: agentAKey,
    },
  );
  launch(
    "agent-b",
    node,
    [cliEntry, "agent", "--config", `./agents/agent-b/${configDir}`],
    {
      AGENT_B_PRIVATE_KEY: agentBKey,
    },
  );
  launch(
    "agent-c",
    node,
    [cliEntry, "agent", "--config", `./agents/agent-c/${configDir}`],
    {
      AGENT_C_PRIVATE_KEY: agentCKey,
    },
  );

  const chatCmd = USE_TESTNET ? "demo:chat:testnet" : "demo:chat";
  const uiCmd = USE_TESTNET ? "ui:dev:testnet:state" : "ui:dev:local";
  console.log(
    `${prefix("demo")} agents up. In another terminal run:${RESET}`,
  );
  console.log(`${prefix("demo")}   ${BOLD}npm run ${uiCmd}${RESET}${COLORS.demo} (UI)${RESET}`);
  console.log(
    `${prefix("demo")}   ${BOLD}npm run ${chatCmd}${RESET}${COLORS.demo} (post RFQ)${RESET}`,
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
