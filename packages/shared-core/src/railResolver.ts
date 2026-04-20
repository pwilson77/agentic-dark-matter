import { evmRailAdapter } from "./evmRailAdapter.js";
import { simulatedReadonlyRailAdapter } from "./simulatedReadonlyRailAdapter.js";
import type { RailAdapter, RailId } from "./railAdapter.js";

const RAIL_ADAPTERS: Record<RailId, RailAdapter> = {
  "evm-bnb": evmRailAdapter,
  "simulated-readonly": simulatedReadonlyRailAdapter,
};

function railIdFromNetwork(network?: string): RailId {
  const normalized = String(network || "").toLowerCase();
  if (
    normalized.includes("simulated") ||
    normalized.includes("mock") ||
    normalized.includes("readonly")
  ) {
    return "simulated-readonly";
  }

  if (
    normalized.includes("bsc") ||
    normalized.includes("anvil") ||
    normalized.includes("evm") ||
    normalized.includes("sepolia")
  ) {
    return "evm-bnb";
  }

  return "evm-bnb";
}

export function resolveRailAdapter(input?: {
  railId?: RailId;
  network?: string;
}): RailAdapter {
  const railId = input?.railId || railIdFromNetwork(input?.network);
  const adapter = RAIL_ADAPTERS[railId];
  if (!adapter) {
    throw new Error(`Unsupported rail adapter: ${railId}`);
  }
  return adapter;
}

export function listSupportedRails(): RailId[] {
  return Object.keys(RAIL_ADAPTERS) as RailId[];
}
