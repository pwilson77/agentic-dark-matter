const API_BASE = (
  process.env.DARK_MATTER_UI_BASE_URL || "http://127.0.0.1:3000"
).replace(/\/$/, "");
const SESSION_API = `${API_BASE}/api/session?source=local`;
const LIVE_API = `${API_BASE}/api/session?source=local&live=1&since=0`;
const ACTION_API = `${API_BASE}/api/session/action`;

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url, options = undefined) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(`Unable to reach ${url}. Start @adm/dark-matter-ui first.`);
  }

  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed with ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json;
}

async function loadPoolContext() {
  const payload = await fetchJson(SESSION_API);
  assertCondition(
    Array.isArray(payload?.pools),
    "Local session payload has no pools array.",
  );
  assertCondition(
    payload.pools.length > 0,
    "No local pools found. Run local demo first.",
  );

  const pool = payload.pools[0];
  assertCondition(pool?.id, "Pool id missing in local payload.");
  assertCondition(
    typeof pool?.settlement?.contractAddress === "string",
    "Pool settlement contractAddress missing.",
  );

  const timeoutSignals = (pool.timeline || []).filter(
    (event) =>
      String(event?.detail || "")
        .toLowerCase()
        .includes("timeout") ||
      String(event?.detail || "")
        .toLowerCase()
        .includes("auto-claim"),
  );

  return {
    poolId: String(pool.id),
    contractAddress: String(pool.settlement.contractAddress || ""),
    timeoutSignalCount: timeoutSignals.length,
  };
}

async function postAction(poolId, action, contractAddress, stepId, reason) {
  return await fetchJson(ACTION_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      poolId,
      action,
      contractAddress,
      stepId,
      reason,
    }),
  });
}

async function verifyLiveTimelineContainsOperatorActions() {
  const livePayload = await fetchJson(LIVE_API);
  const events = Array.isArray(livePayload?.events) ? livePayload.events : [];
  const operatorEvents = events.filter((item) =>
    String(item?.event?.title || "")
      .toLowerCase()
      .includes("operator action"),
  );

  assertCondition(
    operatorEvents.length >= 3,
    "Expected at least 3 operator action timeline events after verification actions.",
  );

  return operatorEvents.length;
}

async function main() {
  const context = await loadPoolContext();

  const retry = await postAction(
    context.poolId,
    "retry-step",
    context.contractAddress,
    "settlement",
    undefined,
  );
  assertCondition(
    retry.status === "accepted",
    "Retry-step action was rejected.",
  );

  const reveal = await postAction(
    context.poolId,
    "force-reveal-public-summary",
    context.contractAddress,
    undefined,
    undefined,
  );
  assertCondition(
    reveal.status === "accepted",
    "Force-reveal-public-summary action was rejected.",
  );

  const escalate = await postAction(
    context.poolId,
    "escalate-dispute",
    context.contractAddress,
    "settlement",
    "verification escalation",
  );
  assertCondition(
    escalate.status === "accepted",
    "Escalate-dispute action was rejected.",
  );

  const operatorEventCount = await verifyLiveTimelineContainsOperatorActions();

  console.log(
    "timeout signal count in pool timeline:",
    context.timeoutSignalCount,
  );
  console.log(
    "operator actions accepted: retry-step, force-reveal-public-summary, escalate-dispute",
  );
  console.log("live timeline operator events:", operatorEventCount);
  console.log("timeout/operator verification passed");
}

main().catch((error) => {
  console.error(
    "timeout/operator verification failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
