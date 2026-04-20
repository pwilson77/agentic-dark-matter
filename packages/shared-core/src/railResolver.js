import { evmRailAdapter } from "./evmRailAdapter.js";
import { simulatedReadonlyRailAdapter } from "./simulatedReadonlyRailAdapter.js";
const RAIL_ADAPTERS = {
    "evm-bnb": evmRailAdapter,
    "simulated-readonly": simulatedReadonlyRailAdapter,
};
function railIdFromNetwork(network) {
    const normalized = String(network || "").toLowerCase();
    if (normalized.includes("simulated") ||
        normalized.includes("mock") ||
        normalized.includes("readonly")) {
        return "simulated-readonly";
    }
    if (normalized.includes("bsc") ||
        normalized.includes("anvil") ||
        normalized.includes("evm") ||
        normalized.includes("sepolia")) {
        return "evm-bnb";
    }
    return "evm-bnb";
}
export function resolveRailAdapter(input) {
    const railId = input?.railId || railIdFromNetwork(input?.network);
    const adapter = RAIL_ADAPTERS[railId];
    if (!adapter) {
        throw new Error(`Unsupported rail adapter: ${railId}`);
    }
    return adapter;
}
export function listSupportedRails() {
    return Object.keys(RAIL_ADAPTERS);
}
