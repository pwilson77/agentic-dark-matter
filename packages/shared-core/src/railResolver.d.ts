import type { RailAdapter, RailId } from "./railAdapter.js";
export declare function resolveRailAdapter(input?: {
    railId?: RailId;
    network?: string;
}): RailAdapter;
export declare function listSupportedRails(): RailId[];
