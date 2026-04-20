import type { OperatorActionRequest, OperatorActionResponse } from "./types.js";

function resolveOperatorApiBase(): string {
  return (
    process.env.DARK_MATTER_OPERATOR_API_URL || "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

async function postOperatorAction(
  request: OperatorActionRequest,
): Promise<OperatorActionResponse> {
  const url = `${resolveOperatorApiBase()}/api/session/action`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = (await response.json()) as OperatorActionResponse;
  if (!response.ok) {
    throw new Error(
      payload?.detail || `Operator action failed with ${response.status}`,
    );
  }

  return payload;
}

export async function retryStepViaMcp(
  poolId: string,
  stepId?: string,
  contractAddress?: string,
): Promise<OperatorActionResponse> {
  return postOperatorAction({
    poolId,
    action: "retry-step",
    stepId,
    contractAddress,
  });
}

export async function forceRevealPublicSummaryViaMcp(
  poolId: string,
): Promise<OperatorActionResponse> {
  return postOperatorAction({
    poolId,
    action: "force-reveal-public-summary",
  });
}

export async function escalateDisputeViaMcp(
  poolId: string,
  reason?: string,
  contractAddress?: string,
): Promise<OperatorActionResponse> {
  return postOperatorAction({
    poolId,
    action: "escalate-dispute",
    reason,
    contractAddress,
  });
}
