import type {
  ActionGraphArtifact,
  ActionGraphEdge,
  ActionGraphNode,
} from "./types.js";
import { readFile, writeFile } from "node:fs/promises";

const graphStore = new Map<string, ActionGraphArtifact>();
const FILE_STORE_DEFAULT_PATH = "/tmp/agentic-dark-matter-action-graphs.json";

interface ActionGraphStore {
  save(artifact: ActionGraphArtifact): Promise<void>;
  get(storageRef: string): Promise<ActionGraphArtifact | null>;
}

class MemoryActionGraphStore implements ActionGraphStore {
  async save(artifact: ActionGraphArtifact): Promise<void> {
    graphStore.set(artifact.storageRef, artifact);
  }

  async get(storageRef: string): Promise<ActionGraphArtifact | null> {
    return graphStore.get(storageRef) || null;
  }
}

class FileActionGraphStore implements ActionGraphStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readAll(): Promise<Record<string, ActionGraphArtifact>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, ActionGraphArtifact>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async save(artifact: ActionGraphArtifact): Promise<void> {
    const all = await this.readAll();
    all[artifact.storageRef] = artifact;
    await writeFile(this.filePath, JSON.stringify(all, null, 2), "utf8");
  }

  async get(storageRef: string): Promise<ActionGraphArtifact | null> {
    const all = await this.readAll();
    return all[storageRef] || null;
  }
}

function resolveActionGraphStore(): ActionGraphStore {
  if (process.env.DARK_MATTER_ACTION_GRAPH_STORE === "file") {
    const filePath =
      process.env.DARK_MATTER_ACTION_GRAPH_FILE || FILE_STORE_DEFAULT_PATH;
    return new FileActionGraphStore(filePath);
  }

  return new MemoryActionGraphStore();
}

const actionGraphStore = resolveActionGraphStore();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export interface StoreActionGraphInput {
  agreementId: string;
  nodes: ActionGraphNode[];
  edges: ActionGraphEdge[];
}

export async function storeActionGraph(
  input: StoreActionGraphInput,
): Promise<ActionGraphArtifact> {
  const storageRef = `local://action-graph/${input.agreementId}`;
  const payload = {
    agreementId: input.agreementId,
    storageRef,
    createdAt: new Date().toISOString(),
    nodes: input.nodes,
    edges: input.edges,
  };

  const graphHash = await sha256Hex(JSON.stringify(payload));
  const artifact: ActionGraphArtifact = {
    ...payload,
    graphHash,
  };

  graphStore.set(storageRef, artifact);
  await actionGraphStore.save(artifact);
  return artifact;
}

export async function getStoredActionGraphByRef(
  storageRef: string,
): Promise<ActionGraphArtifact | null> {
  const inMemory = graphStore.get(storageRef);
  if (inMemory) {
    return inMemory;
  }

  return actionGraphStore.get(storageRef);
}
