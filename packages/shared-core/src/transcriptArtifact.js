import { readFile, writeFile } from "node:fs/promises";
const transcriptStore = new Map();
const FILE_STORE_DEFAULT_PATH = "/tmp/agentic-dark-matter-transcripts.json";
class MemoryTranscriptArtifactStore {
    async save(artifact) {
        transcriptStore.set(artifact.storageRef, artifact);
    }
    async get(storageRef) {
        return transcriptStore.get(storageRef) || null;
    }
}
class FileTranscriptArtifactStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async readAll() {
        try {
            const raw = await readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        }
        catch {
            return {};
        }
    }
    async save(artifact) {
        const all = await this.readAll();
        all[artifact.storageRef] = artifact;
        await writeFile(this.filePath, JSON.stringify(all, null, 2), "utf8");
    }
    async get(storageRef) {
        const all = await this.readAll();
        return all[storageRef] || null;
    }
}
function resolveArtifactStore() {
    if (process.env.DARK_MATTER_TRANSCRIPT_STORE === "file") {
        const filePath = process.env.DARK_MATTER_TRANSCRIPT_FILE || FILE_STORE_DEFAULT_PATH;
        return new FileTranscriptArtifactStore(filePath);
    }
    return new MemoryTranscriptArtifactStore();
}
const artifactStore = resolveArtifactStore();
function toHex(bytes) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
function fromHex(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
}
async function deriveAesKey(secret) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return globalThis.crypto.subtle.importKey("raw", digest, {
        name: "AES-GCM",
        length: 256,
    }, false, ["encrypt", "decrypt"]);
}
export async function storeEncryptedTranscript(input) {
    const canonicalTranscript = JSON.stringify(input.transcript);
    const transcriptHash = await sha256Hex(canonicalTranscript);
    const key = await deriveAesKey(input.secret);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await globalThis.crypto.subtle.encrypt({
        name: "AES-GCM",
        iv,
    }, key, new TextEncoder().encode(canonicalTranscript));
    const storageRef = `local://transcript/${input.agreementId}`;
    const artifactPayload = {
        agreementId: input.agreementId,
        storageRef,
        ivHex: toHex(iv),
        ciphertextHex: toHex(new Uint8Array(encrypted)),
        transcriptHash,
        createdAt: new Date().toISOString(),
    };
    const artifactHash = await sha256Hex(JSON.stringify(artifactPayload));
    const artifact = {
        ...artifactPayload,
        artifactHash,
    };
    transcriptStore.set(storageRef, artifact);
    await artifactStore.save(artifact);
    return artifact;
}
export async function decryptStoredTranscript(artifact, secret) {
    const key = await deriveAesKey(secret);
    const decrypted = await globalThis.crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: toArrayBuffer(fromHex(artifact.ivHex)),
    }, key, toArrayBuffer(fromHex(artifact.ciphertextHex)));
    const json = new TextDecoder().decode(new Uint8Array(decrypted));
    return JSON.parse(json);
}
export async function getStoredTranscriptByRef(storageRef) {
    const inMemory = transcriptStore.get(storageRef);
    if (inMemory) {
        return inMemory;
    }
    return artifactStore.get(storageRef);
}
