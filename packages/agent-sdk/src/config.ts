import type { RailId } from "@adm/shared-core";
import { AgentSdkError } from "./errors.js";

export interface AgentSdkRetryPolicy {
  readMaxAttempts?: number;
  readDelayMs?: number;
}

export interface AgentSdkConfig {
  rpcUrl: string;
  railId?: RailId;
  source?: "mock" | "local" | "prod";
  retries?: AgentSdkRetryPolicy;
}

export interface NormalizedAgentSdkConfig {
  rpcUrl: string;
  railId: RailId;
  source: "mock" | "local" | "prod";
  retries: {
    readMaxAttempts: number;
    readDelayMs: number;
  };
}

export function normalizeSdkConfig(
  config: AgentSdkConfig,
): NormalizedAgentSdkConfig {
  if (!config.rpcUrl || config.rpcUrl.trim().length === 0) {
    throw new AgentSdkError({
      code: "INVALID_CONFIG",
      operation: "normalizeSdkConfig",
      message: "rpcUrl is required",
    });
  }

  return {
    rpcUrl: config.rpcUrl,
    railId: config.railId || "evm-bnb",
    source: config.source || "local",
    retries: {
      readMaxAttempts: config.retries?.readMaxAttempts ?? 1,
      readDelayMs: config.retries?.readDelayMs ?? 300,
    },
  };
}

export function sdkConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgentSdkConfig {
  return {
    rpcUrl: env.DARK_MATTER_RPC_URL || "http://127.0.0.1:8545",
    railId: (env.DARK_MATTER_RAIL_ID as RailId | undefined) || "evm-bnb",
    source:
      (env.DARK_MATTER_POOL_SOURCE as "mock" | "local" | "prod" | undefined) ||
      "local",
    retries: {
      readMaxAttempts: Number.parseInt(
        env.DARK_MATTER_SDK_READ_MAX_ATTEMPTS || "1",
        10,
      ),
      readDelayMs: Number.parseInt(
        env.DARK_MATTER_SDK_READ_DELAY_MS || "300",
        10,
      ),
    },
  };
}
