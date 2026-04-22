export interface AgentIdentity {
  id: string;
  displayName: string;
  erc8004Id: string;
  capabilities: string[];
  walletAddress?: string;
}

export interface RfqScoreWeights {
  price: number;
  eta: number;
  reliability: number;
  capabilityFit: number;
}

export interface RfqBid {
  candidate: AgentIdentity;
  quoteBnb: number;
  etaMinutes: number;
  reliability: number;
  capabilityFit: number;
  score: number;
}

export interface RfqRequest {
  objective: string;
  requiredCapabilities: string[];
  maxQuoteBnb: number;
  maxEtaMinutes: number;
  candidates: AgentIdentity[];
  scoreWeights?: Partial<RfqScoreWeights>;
}

export interface RfqSelection {
  selected: RfqBid;
  fallback?: RfqBid;
  bids: RfqBid[];
}

export interface JointVentureTerms {
  liquidityBnb: number;
  raidCoverageHours: number;
  revenueShareBpsAgentA: number;
  revenueShareBpsAgentB: number;
  treasuryAddress: string;
  notes: string;
}

export interface NegotiationOffer {
  proposer: AgentIdentity;
  counterparty: AgentIdentity;
  objective: string;
  terms: JointVentureTerms;
  secrecyLevel: "private" | "sealed";
}

export interface NegotiationTranscriptEntry {
  speaker: string;
  message: string;
  at: string;
}

export interface NegotiationEnvelopePayload {
  agreementId: string;
  objective: string;
  participants: [string, string];
  secrecyLevel: "private" | "sealed";
  termsHash: string;
  deliveryCommitmentHash: string;
  nonce: string;
  createdAt: string;
}

export interface NegotiationEnvelope {
  envelopeId: string;
  signerAgentId: string;
  signerAddress: string;
  payload: NegotiationEnvelopePayload;
  payloadHash: string;
  signature: string;
}

export type ExecutionPhase =
  | "preflight"
  | "discovery"
  | "negotiation"
  | "consensus"
  | "deployment"
  | "settlement"
  | "artifact"
  | "operator";

export interface ActionGraphNode {
  id: string;
  phase: ExecutionPhase;
  action: string;
  actor: string;
  timestamp: string;
  status: "pending" | "success" | "failed";
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface ActionGraphEdge {
  from: string;
  to: string;
  type: "temporal" | "causal";
}

export interface ActionGraphArtifact {
  agreementId: string;
  storageRef: string;
  graphHash: string;
  createdAt: string;
  nodes: ActionGraphNode[];
  edges: ActionGraphEdge[];
}

export type OperatorActionType =
  | "retry-step"
  | "force-reveal-public-summary"
  | "escalate-dispute";

export interface OperatorActionRequest {
  poolId: string;
  action: OperatorActionType;
  stepId?: string;
  reason?: string;
  contractAddress?: string;
}

export interface OperatorActionResponse {
  requestId: string;
  poolId: string;
  action: OperatorActionType;
  status: "accepted" | "rejected";
  detail: string;
  createdAt: string;
  summary?: string;
  onChainTxHash?: string;
}

export interface EncryptedTranscriptArtifact {
  agreementId: string;
  storageRef: string;
  ivHex: string;
  ciphertextHex: string;
  transcriptHash: string;
  artifactHash: string;
  createdAt: string;
}

export interface NegotiationResult {
  accepted: boolean;
  consensusSummary: string;
  transcript: NegotiationTranscriptEntry[];
  agreementId?: string;
  rejectionReason?: string;
}

export interface AgreementArtifact {
  agreementId: string;
  agreementHash: string;
  network: string;
  contractType: "DarkMatterEscrow";
  deployedAt: string;
  dryRun: boolean;
  deployer: string;
  transcriptHash: string;
  transcriptStorageRef: string;
  transcriptArtifactHash: string;
  terms: JointVentureTerms;
  participants: [AgentIdentity, AgentIdentity];
  contractAddress?: string;
  deploymentTxHash?: string;
  deploymentBlockNumber?: number;
  chainId?: number;
  actionGraphHash?: string;
  actionGraphStorageRef?: string;
}
