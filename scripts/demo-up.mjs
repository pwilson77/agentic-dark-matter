#!/usr/bin/env node
/**
 * Launches Anvil + agents A/B/C in a single terminal with interleaved,
 * colored, prefixed logs. Loads LLM config from .env.testnet but forces
 * the RPC/chain to the local anvil.
 *
 * Usage: node ./scripts/demo-up.mjs [--no-anvil] [--no-llm]
 * Ctrl+C once shuts them all down.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const argv = process.argv.slice(2);
const SKIP_ANVIL = argv.includes("--no-anvil");
const SKIP_LLM = argv.includes("--no-llm");

// ---- load .env.testnet but only keep LLM + secret vars ----
const llmEnv = {};
const envFile = path.join(ROOT, ".env.testnet");
if (!SKIP_LLM && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, rawV] = m;
    if (k.startsWith("DARK_MATTER_LLM_") || k === "DARK_MATTER_TRANSCRIPT_SECRET") {
      // strip surrounding quotes
      llmEnv[k] = rawV.replace(/^['"]|['"]$/g, "");
    }
  }
}

// Clear stale state
const stateFile = "/tmp/adm-agent-state.json";
if (existsSync(stateFile)) {
  unlinkSync(stateFile);
  console.log(`[demo-up] cleared stale ${stateFile}`);
}

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
    DARK_MATTER_RPC_URL: "http://127.0.0.1:8545",
    DARK_MATTER_CHAIN_ID: "31337",
    DARK_MATTER_NETWORK: "anvil-local",
    ...extraEnv,
  };
  const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
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

// ---- wait for anvil ----
async function waitForAnvil(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch("http://127.0.0.1:8545", {
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

// ---- orchestrate startup ----
async function main() {
  console.log(`${prefix("demo")} Agentic Dark Matter — local demo up${RESET}`);
  console.log(
    `${prefix("demo")} LLM ${Object.keys(llmEnv).some((k) => k.includes("API_KEY")) ? "enabled (keys loaded from .env.testnet)" : "disabled (no keys found)"}${RESET}`,
  );

  if (!SKIP_ANVIL) {
    launch("anvil", "sh", [
      "-c",
      'export PATH="$HOME/.foundry/bin:$PATH" && cd contracts && anvil --host 127.0.0.1 --port 8545 --silent',
    ]);
    console.log(`${prefix("demo")} waiting for anvil on :8545 ...${RESET}`);
    const ok = await waitForAnvil();
    if (!ok) {
      console.error(`${prefix("demo")} anvil did not start in time; aborting${RESET}`);
      shutdown(1);
      return;
    }
    console.log(`${prefix("demo")} anvil is up${RESET}`);
  } else {
    const ok = await waitForAnvil(2000);
    if (!ok) {
      console.error(
        `${prefix("demo")} --no-anvil set but no RPC on 127.0.0.1:8545; start anvil yourself first${RESET}`,
      );
      process.exit(1);
    }
  }

  const node = process.execPath;
  const cliEntry = path.join(ROOT, "apps/agent-runtime/dist/cli.js");
  if (!existsSync(cliEntry)) {
    console.error(
      `${prefix("demo")} ${cliEntry} not found — run: npm --workspace @adm/agent-runtime run build${RESET}`,
    );
    process.exit(1);
  }

  launch("agent-a", node, [cliEntry, "agent", "--config", "./agents/agent-a/config.json"], {
    AGENT_A_PRIVATE_KEY:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  });
  launch("agent-b", node, [cliEntry, "agent", "--config", "./agents/agent-b/config.json"], {
    AGENT_B_PRIVATE_KEY:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  });
  launch("agent-c", node, [cliEntry, "agent", "--config", "./agents/agent-c/config.json"], {
    AGENT_C_PRIVATE_KEY:
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  });

  console.log(
    `${prefix("demo")} agents up. In another terminal run: ${BOLD}npm run demo:chat${RESET}${COLORS.demo}  (or: node ./scripts/demo-post.mjs)${RESET}`,
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
