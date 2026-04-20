import type { ActionGraphArtifact, ActionGraphEdge, ActionGraphNode } from "./types.js";
export interface StoreActionGraphInput {
    agreementId: string;
    nodes: ActionGraphNode[];
    edges: ActionGraphEdge[];
}
export declare function storeActionGraph(input: StoreActionGraphInput): Promise<ActionGraphArtifact>;
export declare function getStoredActionGraphByRef(storageRef: string): Promise<ActionGraphArtifact | null>;
