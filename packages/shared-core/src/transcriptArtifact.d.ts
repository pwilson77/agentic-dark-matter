import type { EncryptedTranscriptArtifact, NegotiationTranscriptEntry } from "./types.js";
export interface StoreEncryptedTranscriptInput {
    agreementId: string;
    transcript: NegotiationTranscriptEntry[];
    secret: string;
}
export declare function storeEncryptedTranscript(input: StoreEncryptedTranscriptInput): Promise<EncryptedTranscriptArtifact>;
export declare function decryptStoredTranscript(artifact: EncryptedTranscriptArtifact, secret: string): Promise<NegotiationTranscriptEntry[]>;
export declare function getStoredTranscriptByRef(storageRef: string): Promise<EncryptedTranscriptArtifact | null>;
