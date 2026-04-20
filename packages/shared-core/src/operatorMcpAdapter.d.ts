import type { OperatorActionResponse } from "./types.js";
export declare function retryStepViaMcp(poolId: string, stepId?: string, contractAddress?: string): Promise<OperatorActionResponse>;
export declare function forceRevealPublicSummaryViaMcp(poolId: string): Promise<OperatorActionResponse>;
export declare function escalateDisputeViaMcp(poolId: string, reason?: string, contractAddress?: string): Promise<OperatorActionResponse>;
