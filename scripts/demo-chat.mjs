#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const argv = process.argv.slice(2);
const USE_TESTNET = argv.includes("testnet") || argv.includes("--testnet");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const parsed = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, rawV] = m;
    parsed[k] = rawV.replace(/^['"]|['"]$/g, "");
  }
  return parsed;
}

function resolvePlaceholders(values) {
  const out = { ...values };
  const replace = (value) =>
    value.replace(/\$\{([^}]+)\}/g, (_, key) => out[key] ?? process.env[key] ?? "");

  for (const key of Object.keys(out)) {
    if (typeof out[key] !== "string") continue;
    let current = out[key];
    for (let i = 0; i < 5; i += 1) {
      const next = replace(current);
      if (next === current) break;
      current = next;
    }
    out[key] = current;
  }
  return out;
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const envFile = path.join(ROOT, ".env.testnet");
  const fileEnv = resolvePlaceholders(parseEnvFile(envFile));

  const baseEnv = {
    ...process.env,
    ...(existsSync(envFile) ? fileEnv : {}),
  };

  const modeEnv = USE_TESTNET
    ? {}
    : {
        DARK_MATTER_RPC_URL: "http://127.0.0.1:8545",
        DARK_MATTER_CHAIN_ID: "31337",
        DARK_MATTER_NETWORK: "anvil-local",
        DARK_MATTER_DEPLOYER_PRIVATE_KEY:
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        DARK_MATTER_AGENT_A_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      };

  const env = {
    ...baseEnv,
    ...modeEnv,
  };

  console.log(
    `[demo-chat] mode=${USE_TESTNET ? "testnet" : "local"} rpc=${env.DARK_MATTER_RPC_URL || "(unset)"}`,
  );

  await run("npm", ["--workspace", "@adm/shared-core", "run", "build"], env);
  await run("npm", ["--workspace", "@adm/agent-runtime", "run", "build"], env);
  await run(
    "node",
    [
      "./apps/agent-runtime/dist/cli.js",
      "post-task",
      "--interactive",
      "true",
      "--timeout-ms",
      env.DARK_MATTER_RFQ_TIMEOUT_MS || "180000",
    ],
    env,
  );
}

main().catch((error) => {
  console.error(`[demo-chat] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
