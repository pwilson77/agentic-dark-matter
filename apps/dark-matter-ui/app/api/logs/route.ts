import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LogLine {
  at: string;
  scope: string;
  message: string;
}

/**
 * Tails the agent log JSONL file. Each agent invocation of `log()` appends
 * one JSON line: {at, scope, message}. The file is cleared by demo-up.mjs.
 *
 * Query params:
 *   limit: number of most recent lines to return (default 200, max 1000)
 *   since: ISO timestamp — only return lines strictly after this
 */
export async function GET(request: Request) {
  const logFile = process.env.AGENT_LOG_FILE || "/tmp/adm-agent-logs.jsonl";
  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") || "200", 10);
  const limit = Math.min(Math.max(rawLimit, 1), 1000);
  const since = searchParams.get("since") || undefined;

  try {
    await stat(logFile);
  } catch {
    return NextResponse.json({ lines: [], source: logFile, exists: false });
  }

  let text: string;
  try {
    text = await readFile(logFile, "utf8");
  } catch (err) {
    return NextResponse.json(
      { lines: [], source: logFile, exists: true, error: String(err) },
      { status: 500 },
    );
  }

  const lines: LogLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as LogLine;
      if (
        typeof parsed.at === "string" &&
        typeof parsed.scope === "string" &&
        typeof parsed.message === "string"
      ) {
        if (since && parsed.at <= since) continue;
        lines.push(parsed);
      }
    } catch {
      // skip malformed line
    }
  }

  const trimmed = lines.slice(-limit);
  return NextResponse.json({
    lines: trimmed,
    source: logFile,
    exists: true,
    total: lines.length,
  });
}
