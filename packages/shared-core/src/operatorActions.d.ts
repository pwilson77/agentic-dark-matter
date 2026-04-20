import type { OperatorActionRequest, OperatorActionResponse } from "./types.js";
export declare function executeOperatorAction(request: OperatorActionRequest): OperatorActionResponse;
export declare function executeOperatorActionWithOnChain(request: OperatorActionRequest, onChain?: {
    rpcUrl?: string;
    privateKey?: string;
}): Promise<OperatorActionResponse>;
