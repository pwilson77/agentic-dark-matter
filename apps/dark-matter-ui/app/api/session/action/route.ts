import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { executeOperatorActionWithOnChain } from "@adm/shared-core";

type OperatorActionType =
  | "retry-step"
  | "force-reveal-public-summary"
  | "escalate-dispute";

interface OperatorActionRequest {
  poolId: string;
  action: OperatorActionType;
  stepId?: string;
  reason?: string;
  contractAddress?: string;
}

interface OperatorActionResponse {
  requestId: string;
  poolId: string;
  action: OperatorActionType;
  status: "accepted" | "rejected";
  detail: string;
  createdAt: string;
  summary?: string;
  onChainTxHash?: string;
}

interface SessionEventLine {
  step?: string;
  detail?: string;
}

function isSecretLine(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("[secret]") ||
    normalized.includes("[private]") ||
    normalized.includes("[internal]")
  );
}

async function loadPublicTranscriptSummary(
  sessionFile: string,
): Promise<string | undefined> {
  let raw = "";
  try {
    raw = await readFile(sessionFile, "utf8");
  } catch {
    return undefined;
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as SessionEventLine;
      } catch {
        return null;
      }
    })
    .filter((line): line is SessionEventLine => !!line)
    .filter((line) => line.step === "transcript" && !!line.detail)
    .map((line) => String(line.detail || ""))
    .filter((line) => !isSecretLine(line));

  if (lines.length === 0) {
    return undefined;
  }

  return lines.slice(0, 3).join(" | ");
}

export async function POST(request: Request) {
  const sessionFile =
    process.env.DARK_MATTER_SESSION_FILE ||
    "/tmp/agentic-dark-matter-session.jsonl";

  let payload: OperatorActionRequest;
  try {
    payload = (await request.json()) as OperatorActionRequest;
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        detail: "Invalid JSON payload.",
      },
      { status: 400 },
    );
  }

  const summary =
    payload.action === "force-reveal-public-summary"
      ? await loadPublicTranscriptSummary(sessionFile)
      : undefined;

  const response = (await executeOperatorActionWithOnChain(payload, {
    rpcUrl: process.env.DARK_MATTER_RPC_URL,
    privateKey:
      process.env.DARK_MATTER_OPERATOR_PRIVATE_KEY ||
      process.env.DARK_MATTER_AGENT_A_PRIVATE_KEY,
  })) as OperatorActionResponse;

  if (payload.action === "force-reveal-public-summary") {
    response.summary =
      summary || "No public transcript lines available to reveal.";
  }

  const sessionEvent = {
    id: `${response.requestId}-event`,
    sessionId: "operator-actions",
    timestamp: response.createdAt,
    step: "operator-action",
    status: response.status === "accepted" ? "ok" : "warn",
    detail: response.detail,
    meta: response,
  };

  await mkdir(
    sessionFile.includes("/")
      ? sessionFile.slice(0, sessionFile.lastIndexOf("/")) || "/tmp"
      : "/tmp",
    { recursive: true },
  );
  await appendFile(sessionFile, `${JSON.stringify(sessionEvent)}\n`, "utf8");

  return NextResponse.json(response, {
    status: response.status === "accepted" ? 200 : 400,
  });
}
