function normalizeAddress(value) {
    const normalized = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
        throw new Error(`Invalid EVM address: ${value}`);
    }
    return normalized;
}
export function resolveSessionApiBase() {
    return (process.env.DARK_MATTER_OPERATOR_API_URL ||
        process.env.DARK_MATTER_UI_BASE_URL ||
        "http://127.0.0.1:3000").replace(/\/$/, "");
}
async function fetchJson(url) {
    const response = await fetch(url);
    const payload = (await response.json());
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return payload;
}
function matchPool(pools, poolId, contractAddress) {
    const normalizedContract = contractAddress
        ? normalizeAddress(contractAddress)
        : undefined;
    if (poolId) {
        return pools.find((pool) => pool.id === poolId);
    }
    if (normalizedContract) {
        return pools.find((pool) => {
            const found = String(pool.settlement?.contractAddress || "");
            return found ? normalizeAddress(found) === normalizedContract : false;
        });
    }
    return pools[0];
}
export async function inspectStatusFromSessionApi(input, defaultSource) {
    const source = input.source || defaultSource;
    const url = `${resolveSessionApiBase()}/api/session?source=${source}`;
    const snapshot = (await fetchJson(url));
    if (!Array.isArray(snapshot.pools) || snapshot.pools.length === 0) {
        throw new Error("No pools returned by session API.");
    }
    const pool = matchPool(snapshot.pools, input.poolId, input.contractAddress);
    if (!pool) {
        throw new Error("Unable to find matching pool for inspect_status.");
    }
    return {
        source: snapshot.source,
        generatedAt: snapshot.generatedAt,
        selectedPoolId: snapshot.selectedPoolId,
        pool,
    };
}
export async function inspectTimelineFromSessionApi(input, defaultSource) {
    const source = input.source || defaultSource;
    const sinceCursor = Number.isFinite(input.sinceCursor)
        ? Number(input.sinceCursor)
        : 0;
    let poolId = input.poolId;
    if (!poolId && input.contractAddress) {
        const status = await inspectStatusFromSessionApi({
            contractAddress: input.contractAddress,
            source,
        }, defaultSource);
        poolId = String(status.pool.id || "");
    }
    const url = `${resolveSessionApiBase()}/api/session?source=${source}&live=1&since=${Math.max(0, sinceCursor)}`;
    const live = (await fetchJson(url));
    const events = poolId
        ? live.events.filter((item) => item.poolId === poolId)
        : live.events;
    return {
        source: live.source,
        generatedAt: live.generatedAt,
        cursor: live.cursor,
        events,
    };
}
