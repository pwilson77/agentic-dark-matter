import { Interface, JsonRpcProvider, id } from "ethers";

const RPC_URL = process.env.DARK_MATTER_RPC_URL || "http://127.0.0.1:8545";
const API_BASE = process.env.DARK_MATTER_UI_BASE_URL || "http://127.0.0.1:3000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api/session?source=local`;
const FROM_BLOCK = Number.parseInt(
  process.env.DARK_MATTER_LOCAL_FROM_BLOCK || "0",
  10,
);

const ESCROW_EVENTS_ABI = [
  "event PoolCreated(bytes32 indexed poolId, address indexed contractAddress, string status, uint256 balance)",
];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyLocalRpcReachable(provider) {
  const block = await provider.getBlockNumber();
  assertCondition(
    Number.isFinite(block) && block >= 0,
    `Local RPC reachable check failed for ${RPC_URL}`,
  );
  return block;
}

async function verifyPoolEventsIndexed(provider) {
  const topic = id("PoolCreated(bytes32,address,string,uint256)");
  const logs = await provider.getLogs({
    fromBlock: FROM_BLOCK,
    toBlock: "latest",
    topics: [topic],
  });

  assertCondition(
    logs.length > 0,
    "No PoolCreated events found on local chain. Run a non-dry demo first.",
  );

  const iface = new Interface(ESCROW_EVENTS_ABI);
  const parsed = logs
    .map((log) => {
      const parsedLog = iface.parseLog(log);
      return {
        contractAddress: String(parsedLog?.args.contractAddress || ""),
        poolId: String(parsedLog?.args.poolId || ""),
      };
    })
    .filter((entry) => entry.poolId.length > 0);

  assertCondition(
    parsed.length > 0,
    "PoolCreated logs exist but could not be decoded.",
  );

  return { count: logs.length, decoded: parsed };
}

function isEventDerivedPoolId(value) {
  return /^local-[a-f0-9]{8}$/.test(value);
}

async function verifyApiLocalResponse() {
  let response;
  try {
    response = await fetch(API_URL);
  } catch {
    throw new Error(
      `UI API is unreachable at ${API_URL}. Start @adm/dark-matter-ui first.`,
    );
  }

  assertCondition(
    response.ok,
    `API request failed for ${API_URL} with status ${response.status}`,
  );

  const payload = await response.json();
  assertCondition(payload?.source === "local", "API source is not local.");
  assertCondition(Array.isArray(payload?.pools), "API pools is not an array.");
  assertCondition(
    payload.pools.length > 0,
    "API returned no pools for local source (expected event-derived pools).",
  );

  const poolIds = payload.pools
    .map((pool) => String(pool?.id || ""))
    .filter((idValue) => idValue.length > 0);

  const derivedIds = poolIds.filter(isEventDerivedPoolId);
  assertCondition(
    derivedIds.length > 0,
    "API local pools are not event-derived (expected IDs like local-<8 hex chars>).",
  );

  return {
    poolIds,
    derivedIds,
    selectedPoolId: String(payload.selectedPoolId || ""),
  };
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);

  const blockNumber = await verifyLocalRpcReachable(provider);
  const eventResult = await verifyPoolEventsIndexed(provider);
  const apiResult = await verifyApiLocalResponse();

  console.log("local RPC reachable:", RPC_URL, "block", blockNumber);
  console.log("pool events indexed:", eventResult.count);
  console.log("api source=local verified:", API_URL);
  console.log("event-derived IDs:", apiResult.derivedIds.join(", "));
}

main().catch((error) => {
  console.error(
    "local pool verification failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
