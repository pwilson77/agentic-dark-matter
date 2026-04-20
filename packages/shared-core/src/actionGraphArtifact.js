import { readFile, writeFile } from "node:fs/promises";
const graphStore = new Map();
const FILE_STORE_DEFAULT_PATH = "/tmp/agentic-dark-matter-action-graphs.json";
class MemoryActionGraphStore {
    async save(artifact) {
        graphStore.set(artifact.storageRef, artifact);
    }
    async get(storageRef) {
        return graphStore.get(storageRef) || null;
    }
}
class FileActionGraphStore {
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
function resolveActionGraphStore() {
    if (process.env.DARK_MATTER_ACTION_GRAPH_STORE === "file") {
        const filePath = process.env.DARK_MATTER_ACTION_GRAPH_FILE || FILE_STORE_DEFAULT_PATH;
        return new FileActionGraphStore(filePath);
    }
    return new MemoryActionGraphStore();
}
const actionGraphStore = resolveActionGraphStore();
function toHex(bytes) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
}
export async function storeActionGraph(input) {
    const storageRef = `local://action-graph/${input.agreementId}`;
    const payload = {
        agreementId: input.agreementId,
        storageRef,
        createdAt: new Date().toISOString(),
        nodes: input.nodes,
        edges: input.edges,
    };
    const graphHash = await sha256Hex(JSON.stringify(payload));
    const artifact = {
        ...payload,
        graphHash,
    };
    graphStore.set(storageRef, artifact);
    await actionGraphStore.save(artifact);
    return artifact;
}
export async function getStoredActionGraphByRef(storageRef) {
    const inMemory = graphStore.get(storageRef);
    if (inMemory) {
        return inMemory;
    }
    return actionGraphStore.get(storageRef);
}
