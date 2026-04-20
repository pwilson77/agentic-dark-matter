function resolveOperatorApiBase() {
    return (process.env.DARK_MATTER_OPERATOR_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}
async function postOperatorAction(request) {
    const url = `${resolveOperatorApiBase()}/api/session/action`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify(request),
    });
    const payload = (await response.json());
    if (!response.ok) {
        throw new Error(payload?.detail || `Operator action failed with ${response.status}`);
    }
    return payload;
}
export async function retryStepViaMcp(poolId, stepId, contractAddress) {
    return postOperatorAction({
        poolId,
        action: "retry-step",
        stepId,
        contractAddress,
    });
}
export async function forceRevealPublicSummaryViaMcp(poolId) {
    return postOperatorAction({
        poolId,
        action: "force-reveal-public-summary",
    });
}
export async function escalateDisputeViaMcp(poolId, reason, contractAddress) {
    return postOperatorAction({
        poolId,
        action: "escalate-dispute",
        reason,
        contractAddress,
    });
}
