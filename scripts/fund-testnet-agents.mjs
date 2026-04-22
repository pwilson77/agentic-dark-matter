#!/usr/bin/env node
/**
 * fund-testnet-agents.mjs
 *
 * Reads your two testnet wallet keys from the env file, checks their BNB
 * balances, and optionally sends a top-up from Wallet 1 → Wallet 2 so Agent B
 * always has enough gas for approval transactions.
 *
 * Usage:
 *   node ./scripts/fund-testnet-agents.mjs
 *   node ./scripts/fund-testnet-agents.mjs --env .env.testnet
 *   node ./scripts/fund-testnet-agents.mjs --env .env.testnet --send
 */

import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { ethers } from "ethers";

// ── Config ────────────────────────────────────────────────────────────────────

// How much BNB Agent B must hold before we consider it sufficiently funded.
const AGENT_B_MIN_BNB = 0.01;
// How much BNB to send from Wallet 1 → Wallet 2 when Agent B is below minimum.
const AGENT_B_TOP_UP_BNB = 0.05;

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
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) env[key] = value;
  }
  return env;
}

function fmt(bnb) {
  return `${Number(bnb).toFixed(5)} BNB`;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const envFlag = args.indexOf("--env");
  const envFile = envFlag >= 0 ? args[envFlag + 1] : ".env.testnet";
  const sendFlag = args.includes("--send");

  if (!existsSync(envFile)) {
    console.error(`\n  Error: env file not found: ${envFile}`);
    console.error(
      `  Copy .env.testnet.example → .env.testnet and fill in your keys.\n`,
    );
    process.exit(1);
  }

  const env = parseEnvFile(envFile);

  const rpcUrl = env.DARK_MATTER_RPC_URL;
  const deployerKey = env.DARK_MATTER_DEPLOYER_PRIVATE_KEY;
  const agentAKey = env.DARK_MATTER_AGENT_A_PRIVATE_KEY || deployerKey;
  const agentBKey = env.DARK_MATTER_AGENT_B_PRIVATE_KEY;
  const liquidityBnb = Number(env.DARK_MATTER_LIQUIDITY_BNB || "0.05");

  if (!rpcUrl) {
    console.error("  Error: DARK_MATTER_RPC_URL not set in env file.");
    process.exit(1);
  }
  if (!deployerKey) {
    console.error(
      "  Error: DARK_MATTER_DEPLOYER_PRIVATE_KEY not set in env file.",
    );
    process.exit(1);
  }
  if (!agentBKey) {
    console.error(
      "  Error: DARK_MATTER_AGENT_B_PRIVATE_KEY not set in env file.",
    );
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let networkInfo;
  try {
    networkInfo = await provider.getNetwork();
  } catch {
    console.error(`  Error: Could not connect to RPC: ${rpcUrl}`);
    process.exit(1);
  }

  const w1 = new ethers.Wallet(deployerKey, provider);
  const w2 = new ethers.Wallet(agentBKey, provider);

  const [bal1Raw, bal2Raw] = await Promise.all([
    provider.getBalance(w1.address),
    provider.getBalance(w2.address),
  ]);

  const bal1 = Number(ethers.formatEther(bal1Raw));
  const bal2 = Number(ethers.formatEther(bal2Raw));

  // Determine if wallet 1 = wallet 2 (same key reused — no transfer needed)
  const sameWallet = w1.address.toLowerCase() === w2.address.toLowerCase();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Dark Matter — Testnet Agent Funding Check          ║
╚══════════════════════════════════════════════════════════════╝

  Network  : ${networkInfo.name} (chainId ${networkInfo.chainId})
  RPC      : ${rpcUrl}
  Env file : ${envFile}

  ┌────────────────────────────────────────────────────────────┐
  │  Wallet 1 (Deployer / Agent A / Operator)                  │
  │  Address : ${w1.address}      │
  │  Balance : ${fmt(bal1).padEnd(20)} (role: deploy + release + escrow)  │
  ├────────────────────────────────────────────────────────────┤
  │  Wallet 2 (Agent B)                                        │
  │  Address : ${w2.address}${sameWallet ? " ← SAME AS WALLET 1" : ""}      │
  │  Balance : ${fmt(bal2).padEnd(20)} (role: approve only)             │
  └────────────────────────────────────────────────────────────┘

  Config: DARK_MATTER_LIQUIDITY_BNB = ${liquidityBnb} BNB per agreement
`);

  // Cost breakdown
  const gasGwei = 5;
  const gasPriceEth = gasGwei * 1e-9;
  const deployCost = 500_000 * gasPriceEth;
  const approveCost = 80_000 * gasPriceEth;
  const releaseCost = 80_000 * gasPriceEth;
  const perCycleW1 = liquidityBnb + deployCost + releaseCost;
  const perCycleW2 = approveCost;
  const cyclesW1 = Math.floor((bal1 - 0.01) / perCycleW1); // keep 0.01 as buffer
  const cyclesW2 = Math.floor((bal2 - 0.001) / perCycleW2);

  console.log(`  Gas estimate (${gasGwei} Gwei):`);
  console.log(
    `    Deploy + release (Wallet 1): ~${fmt(deployCost + releaseCost)} + ${liquidityBnb} BNB escrow = ${fmt(perCycleW1)}/cycle`,
  );
  console.log(`    Approve (Wallet 2)          : ~${fmt(perCycleW2)}/cycle`);
  console.log(``);
  console.log(`  Estimated agreement cycles:`);
  console.log(
    `    Wallet 1: ~${Math.max(0, cyclesW1)} cycles before hitting buffer`,
  );
  if (!sameWallet) {
    console.log(
      `    Wallet 2: ~${Math.max(0, cyclesW2)} cycles before hitting buffer`,
    );
  }
  console.log(``);

  if (sameWallet) {
    console.log(
      `  ✓ Single-wallet mode: both agents share wallet 1. No transfer needed.\n`,
    );
    process.exit(0);
  }

  // Check if Agent B needs a top-up
  const needsTopUp = bal2 < AGENT_B_MIN_BNB;
  const w1CanCover = bal1 >= AGENT_B_TOP_UP_BNB + perCycleW1 + 0.01;

  if (!needsTopUp) {
    console.log(
      `  ✓ Agent B is sufficiently funded (${fmt(bal2)} ≥ minimum ${fmt(AGENT_B_MIN_BNB)}).`,
    );
    console.log(`    No transfer needed.\n`);
    process.exit(0);
  }

  console.log(
    `  ⚠ Agent B balance (${fmt(bal2)}) is below minimum (${fmt(AGENT_B_MIN_BNB)}).`,
  );

  if (!w1CanCover) {
    console.log(`\n  ✗ Wallet 1 (${fmt(bal1)}) doesn't have enough to cover:`);
    console.log(
      `    Top-up ${fmt(AGENT_B_TOP_UP_BNB)} + one cycle ${fmt(perCycleW1)} + buffer 0.01 BNB`,
    );
    console.log(`\n  Get more testnet BNB from:`);
    console.log(`    https://testnet.binance.org/faucet-smart`);
    console.log(`    https://faucet.quicknode.com/bsc\n`);
    process.exit(1);
  }

  console.log(
    `\n  Proposed transfer: ${fmt(AGENT_B_TOP_UP_BNB)} from Wallet 1 → Wallet 2`,
  );
  console.log(
    `    After: Wallet 1 ~${fmt(bal1 - AGENT_B_TOP_UP_BNB)}, Wallet 2 ~${fmt(bal2 + AGENT_B_TOP_UP_BNB)}\n`,
  );

  const shouldSend = sendFlag || (await confirm("  Send transfer now?"));
  if (!shouldSend) {
    console.log(
      "\n  Skipped. Re-run with --send to transfer without prompt.\n",
    );
    process.exit(0);
  }

  console.log(`\n  Sending ${fmt(AGENT_B_TOP_UP_BNB)} to ${w2.address}...`);
  const tx = await w1.sendTransaction({
    to: w2.address,
    value: ethers.parseEther(String(AGENT_B_TOP_UP_BNB)),
  });
  console.log(`  tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);

  const [newBal1, newBal2] = await Promise.all([
    provider.getBalance(w1.address),
    provider.getBalance(w2.address),
  ]);
  console.log(`\n  Updated balances:`);
  console.log(`    Wallet 1: ${fmt(ethers.formatEther(newBal1))}`);
  console.log(`    Wallet 2: ${fmt(ethers.formatEther(newBal2))}`);
  console.log(`\n  Ready. Start agents with:\n`);
  console.log(`    npm run agent:a:testnet`);
  console.log(`    npm run agent:b:testnet`);
  console.log(`    npm run demo:orchestrate:testnet\n`);
}

main().catch((err) => {
  console.error(`\n  Fatal: ${err.message}\n`);
  process.exit(1);
});
