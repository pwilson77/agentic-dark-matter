import type { ExecutionPhase } from "./types.js";
export interface LogEvent {
    step: string;
    status: "info" | "ok" | "warn";
    detail: string;
    meta?: Record<string, unknown>;
    phase?: ExecutionPhase;
    actionNodeId?: string;
}
export declare function printEvent(event: LogEvent): void;
