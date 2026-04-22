import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentConfig {
  agentId?: string;
  displayName?: string;
  role?: string;
  capabilities?: string[];
  persona?: {
    style?: string;
    goals?: string[];
  };
  wallet?: {
    address?: string;
  };
  network?: {
    chainId?: number;
  };
}

interface AvailableAgent {
  agentId: string;
  displayName: string;
  role: string;
  capabilities: string[];
  style: string;
  goals: string[];
  wallet: string;
  chainId?: number;
  status: "online" | "idle";
}

// candidate roots to search for agents/ folder (monorepo vs standalone)
function candidateRoots(): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "agents"),
    path.resolve(cwd, "..", "..", "agents"),
    path.resolve(cwd, "..", "agents"),
  ];
}

async function findAgentsDir(): Promise<string | null> {
  for (const candidate of candidateRoots()) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      if (entries.some((e) => e.isDirectory() && e.name.startsWith("agent-"))) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    return process.env[name] || "";
  });
}

async function loadAgentConfig(
  agentsDir: string,
  agentDirName: string,
  useTestnet: boolean,
): Promise<AgentConfig | null> {
  const configName = useTestnet ? "config.testnet.json" : "config.json";
  const configPath = path.join(agentsDir, agentDirName, configName);
  try {
    const raw = await readFile(configPath, "utf8");
    const resolved = resolveEnvPlaceholders(raw);
    return JSON.parse(resolved) as AgentConfig;
  } catch {
    // fall back to the other config
    const fallbackName = useTestnet ? "config.json" : "config.testnet.json";
    try {
      const raw = await readFile(
        path.join(agentsDir, agentDirName, fallbackName),
        "utf8",
      );
      return JSON.parse(resolveEnvPlaceholders(raw)) as AgentConfig;
    } catch {
      return null;
    }
  }
}

export async function GET() {
  const agentsDir = await findAgentsDir();
  if (!agentsDir) {
    return NextResponse.json({
      ok: false,
      source: "not-found",
      agents: [] as AvailableAgent[],
    });
  }

  const useTestnet =
    (process.env.DARK_MATTER_NETWORK || "").toLowerCase().includes("bsc") ||
    process.env.DARK_MATTER_CHAIN_ID === "97";

  let dirNames: string[] = [];
  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    dirNames = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("agent-"))
      .map((e) => e.name)
      .sort();
  } catch {
    dirNames = [];
  }

  const agents: AvailableAgent[] = [];
  for (const dirName of dirNames) {
    const cfg = await loadAgentConfig(agentsDir, dirName, useTestnet);
    if (!cfg) continue;
    agents.push({
      agentId: String(cfg.agentId || dirName),
      displayName: String(cfg.displayName || dirName),
      role: String(cfg.role || "executor"),
      capabilities: Array.isArray(cfg.capabilities) ? cfg.capabilities : [],
      style: String(cfg.persona?.style || ""),
      goals: Array.isArray(cfg.persona?.goals) ? cfg.persona!.goals! : [],
      wallet: String(cfg.wallet?.address || ""),
      chainId: cfg.network?.chainId,
      status: "online",
    });
  }

  return NextResponse.json({
    ok: true,
    source: useTestnet ? "testnet" : "local",
    agents,
  });
}
