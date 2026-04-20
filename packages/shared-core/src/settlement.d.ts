export type SettlementMode = "standard" | "timeout-claim";
export interface ExecuteSettlementInput {
    rpcUrl: string;
    contractAddress: string;
    expectedAgentAAddress: string;
    expectedAgentBAddress: string;
    agentAPrivateKey: string;
    agentBPrivateKey: string;
    mode?: SettlementMode;
}
export interface SettlementExecutionResult {
    contractAddress: string;
    treasuryAddress: string;
    mode: SettlementMode;
    agentAApproveTxHash: string;
    agentBApproveTxHash: string | null;
    releaseTxHash: string;
    treasuryBalanceBefore: string;
    treasuryBalanceAfter: string;
    released: boolean;
}
export declare function executeSettlement(input: ExecuteSettlementInput): Promise<SettlementExecutionResult>;
