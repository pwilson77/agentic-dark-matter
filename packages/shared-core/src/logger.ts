import type { ExecutionPhase } from "./types.js";

export interface LogEvent {
  step: string;
  status: "info" | "ok" | "warn";
  detail: string;
  meta?: Record<string, unknown>;
  phase?: ExecutionPhase;
  actionNodeId?: string;
}

export function printEvent(event: LogEvent) {
  const prefix =
    event.status === "ok"
      ? "[ok]"
      : event.status === "warn"
        ? "[warn]"
        : "[info]";
  const meta = event.meta ? ` ${JSON.stringify(event.meta)}` : "";
  console.log(`${prefix} ${event.step}: ${event.detail}${meta}`);
}
