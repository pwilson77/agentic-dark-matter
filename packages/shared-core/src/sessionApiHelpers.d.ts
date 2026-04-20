import type { PoolSource, RailInspectStatusInput, RailInspectStatusResult, RailInspectTimelineInput, RailInspectTimelineResult } from "./railAdapter.js";
export declare function resolveSessionApiBase(): string;
export declare function inspectStatusFromSessionApi(input: RailInspectStatusInput, defaultSource: PoolSource): Promise<RailInspectStatusResult>;
export declare function inspectTimelineFromSessionApi(input: RailInspectTimelineInput, defaultSource: PoolSource): Promise<RailInspectTimelineResult>;
