import type { AgreementArtifact, AgentIdentity, EncryptedTranscriptArtifact, JointVentureTerms } from "./types.js";
export interface OnChainDeployConfig {
    contractsDir: string;
    rpcUrl: string;
    privateKey: string;
    agentAAddress: string;
    agentBAddress: string;
    valueWei: string;
    chainId?: number;
}
export interface DeployAgreementInput {
    agreementId: string;
    participants: [AgentIdentity, AgentIdentity];
    terms: JointVentureTerms;
    network: string;
    dryRun: boolean;
    transcriptArtifact: EncryptedTranscriptArtifact;
    onChain?: OnChainDeployConfig;
}
export declare function deployDarkMatterAgreement(input: DeployAgreementInput): Promise<AgreementArtifact>;
