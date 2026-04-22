import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let cachedContextPromise: Promise<{
  client: Client;
  transport: StdioClientTransport;
} | null> | null = null;

export interface BnbMcpTokenMetadata {
  name: string;
  symbol: string;
  decimals: number | null;
  totalSupply: string | null;
}

export interface BnbMcpChainInfo {
  chainId: string | number | null;
  networkName: string;
}

export interface Erc8004AgentRef {
  agentId: number;
  owner: string;
  tokenURI: string;
}

export interface Erc8004AgentService {
  name: string;
  endpoint?: string;
  version?: string;
  mcpTools?: string[];
  skills?: string[];
  domains?: string[];
  [key: string]: unknown;
}

export interface Erc8004AgentMetadata {
  type?: string;
  name?: string;
  description?: string;
  image?: string;
  active?: boolean;
  x402Support?: boolean;
  services?: Erc8004AgentService[];
  /** Legacy field name — same semantics as services */
  endpoints?: Erc8004AgentService[];
  supportedTrust?: string[];
  registrations?: Array<{ agentId?: number; agentRegistry?: string }>;
}

export interface Erc8004DiscoveredAgent {
  agentId: number;
  owner: string;
  tokenURI: string;
  metadata: Erc8004AgentMetadata;
  /** Matched capability tags / OASF skills found in metadata */
  matchedCapabilities: string[];
  /** Verified on-chain payment wallet (may be same as owner) */
  agentWallet: string | null;
}

function parseToolPayload(toolResult: unknown): Record<string, unknown> | null {
  if (!toolResult || typeof toolResult !== "object") {
    return null;
  }

  const content = (
    toolResult as {
      content?: Array<{ type?: string; text?: string; json?: unknown }>;
    }
  ).content;
  if (!Array.isArray(content)) {
    return null;
  }

  for (const item of content) {
    if (item?.type === "json" && item.json && typeof item.json === "object") {
      return item.json as Record<string, unknown>;
    }

    if (item?.type === "text" && typeof item.text === "string") {
      try {
        const parsed = JSON.parse(item.text);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function parseArgs(value: string | undefined): string[] {
  if (!value) {
    return ["-y", "@bnb-chain/mcp@latest"];
  }
  return value.split(" ").filter(Boolean);
}

async function getContext() {
  if (cachedContextPromise) {
    return cachedContextPromise;
  }

  cachedContextPromise = (async () => {
    if (process.env.BNBCHAIN_MCP_ENABLED !== "true") {
      return null;
    }

    const command = process.env.BNBCHAIN_MCP_COMMAND || "npx";
    const args = parseArgs(process.env.BNBCHAIN_MCP_ARGS);

    const transport = new StdioClientTransport({
      command,
      args,
      env: {
        ...process.env,
        PRIVATE_KEY: "",
      },
    });

    const client = new Client({
      name: "agentic-dark-matter-oracle",
      version: "0.1.0",
    });

    await client.connect(transport);
    return { client, transport };
  })().catch(() => null);

  return cachedContextPromise;
}

export async function fetchBnbMcpChainInfo(
  network: string,
): Promise<BnbMcpChainInfo | null> {
  const context = await getContext();
  if (!context) {
    return null;
  }

  try {
    const result = await context.client.callTool({
      name: "get_chain_info",
      arguments: { network },
    });

    const parsed = parseToolPayload(result);
    if (!parsed) {
      return null;
    }

    const chainId = (parsed.chainId as string | number | undefined) ?? null;
    const networkName = (parsed.network as string | undefined) ?? network;
    return { chainId, networkName };
  } catch {
    return null;
  }
}

/**
 * Calls `get_erc8004_agent` on the BNB MCP server to resolve an agent's
 * on-chain registration (owner address + agentURI).
 */
export async function resolveErc8004Agent(
  agentId: number,
  network: string,
): Promise<Erc8004AgentRef | null> {
  const context = await getContext();
  if (!context) {
    return null;
  }

  try {
    const result = await context.client.callTool({
      name: "get_erc8004_agent",
      arguments: { agentId, network },
    });

    const parsed = parseToolPayload(result);
    if (!parsed) {
      return null;
    }

    const owner = (parsed.owner as string | undefined) ?? "";
    const tokenURI = (parsed.tokenURI as string | undefined) ?? "";
    if (!owner || !tokenURI) {
      return null;
    }

    return { agentId, owner, tokenURI };
  } catch {
    return null;
  }
}

/**
 * Resolves an agentURI to its JSON metadata.  Handles:
 *   data:application/json;base64,<B64>
 *   data:application/json,<JSON>
 *   https:// / http://
 *   ipfs://  (via public gateway)
 *   ar://    (via arweave.net)
 */
export async function fetchAgentMetadata(
  tokenURI: string,
): Promise<Erc8004AgentMetadata | null> {
  try {
    let json: string;

    if (tokenURI.startsWith("data:")) {
      const base64Marker = ";base64,";
      const markerIdx = tokenURI.indexOf(base64Marker);
      if (markerIdx !== -1) {
        const b64 = tokenURI.slice(markerIdx + base64Marker.length);
        // detect plain JSON falsely tagged as base64
        const decoded = b64.trimStart().startsWith("{")
          ? b64
          : Buffer.from(b64, "base64").toString("utf-8");
        json = decoded;
      } else {
        const commaIdx = tokenURI.indexOf(",");
        json =
          commaIdx !== -1
            ? decodeURIComponent(tokenURI.slice(commaIdx + 1))
            : tokenURI;
      }
    } else if (tokenURI.startsWith("ipfs://")) {
      const cid = tokenURI.slice("ipfs://".length);
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
      ];
      let fetched: string | null = null;
      for (const gw of gateways) {
        try {
          const resp = await fetch(gw, { signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            fetched = await resp.text();
            break;
          }
        } catch {
          continue;
        }
      }
      if (!fetched) return null;
      json = fetched;
    } else if (tokenURI.startsWith("ar://")) {
      const txId = tokenURI.slice("ar://".length);
      const resp = await fetch(`https://arweave.net/${txId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      json = await resp.text();
    } else if (
      tokenURI.startsWith("http://") ||
      tokenURI.startsWith("https://")
    ) {
      const resp = await fetch(tokenURI, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;
      json = await resp.text();
    } else {
      // plain JSON stored directly as tokenURI
      json = tokenURI;
    }

    const parsed = JSON.parse(json) as Erc8004AgentMetadata;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Scans a range of agent IDs on the ERC-8004 registry via BNB MCP and
 * returns agents whose metadata matches the requested capability.
 *
 * Matching strategy (any of):
 *  1. OASF skills containing the capability term
 *  2. OASF domains containing the capability term
 *  3. MCP tool names containing the capability term
 *  4. agent name/description containing the capability term
 *
 * @param capability  e.g. "telegram-raiding", "liquidity-provision"
 * @param network     e.g. "bsc-testnet", "bsc"
 * @param scanRange   how many agent IDs to scan (default 20, starting from 1)
 */
export async function discoverAgentsByCapability(
  capability: string,
  network: string,
  scanRange = 20,
): Promise<Erc8004DiscoveredAgent[]> {
  const term = capability.toLowerCase().replace(/-/g, " ");

  const results: Erc8004DiscoveredAgent[] = [];

  const checks = Array.from({ length: scanRange }, (_, i) =>
    resolveErc8004Agent(i + 1, network),
  );
  const refs = await Promise.allSettled(checks);

  for (const settled of refs) {
    if (settled.status !== "fulfilled" || !settled.value) continue;
    const ref = settled.value;

    const metadata = await fetchAgentMetadata(ref.tokenURI);
    if (!metadata) continue;

    if (metadata.active === false) continue;

    const services: Erc8004AgentService[] =
      metadata.services ?? metadata.endpoints ?? [];

    const matchedCapabilities: string[] = [];

    // OASF skills/domains
    for (const svc of services) {
      if (svc.name === "OASF") {
        for (const skill of svc.skills ?? []) {
          if (skill.toLowerCase().includes(term))
            matchedCapabilities.push(skill);
        }
        for (const domain of svc.domains ?? []) {
          if (domain.toLowerCase().includes(term))
            matchedCapabilities.push(domain);
        }
      }
    }

    // MCP tool names
    for (const svc of services) {
      if (svc.name === "MCP") {
        for (const tool of svc.mcpTools ?? []) {
          if (tool.toLowerCase().includes(term)) matchedCapabilities.push(tool);
        }
      }
    }

    // name / description fallback
    const desc =
      `${metadata.name ?? ""} ${metadata.description ?? ""}`.toLowerCase();
    if (matchedCapabilities.length === 0 && desc.includes(term)) {
      matchedCapabilities.push(metadata.name ?? "name-match");
    }

    if (matchedCapabilities.length === 0) continue;

    // extract agentWallet from services
    const walletSvc = services.find((s) => s.name === "agentWallet");
    const agentWallet: string | null = walletSvc?.endpoint
      ? // strip CAIP-10 prefix → keep just the address part
        (walletSvc.endpoint.split(":").pop() ?? null)
      : null;

    results.push({
      agentId: ref.agentId,
      owner: ref.owner,
      tokenURI: ref.tokenURI,
      metadata,
      matchedCapabilities,
      agentWallet,
    });
  }

  return results;
}

export async function fetchBnbMcpTokenMetadata(
  tokenAddress: string,
  network: string,
): Promise<BnbMcpTokenMetadata | null> {
  const context = await getContext();
  if (!context) {
    return null;
  }

  try {
    const contractResult = await context.client.callTool({
      name: "is_contract",
      arguments: {
        address: tokenAddress,
        network,
      },
    });

    const contractParsed = parseToolPayload(contractResult);
    if (!contractParsed || !contractParsed.isContract) {
      return null;
    }

    const infoResult = await context.client.callTool({
      name: "get_erc20_token_info",
      arguments: {
        tokenAddress,
        network,
      },
    });

    const parsed = parseToolPayload(infoResult);
    if (!parsed) {
      return null;
    }

    const name = parsed.name;
    const symbol = parsed.symbol;
    if (typeof name !== "string" || typeof symbol !== "string") {
      return null;
    }

    return {
      name,
      symbol,
      decimals:
        typeof parsed.decimals === "number"
          ? parsed.decimals
          : typeof parsed.decimals === "string"
            ? Number(parsed.decimals)
            : null,
      totalSupply:
        typeof parsed.formattedTotalSupply === "string"
          ? parsed.formattedTotalSupply
          : typeof parsed.totalSupply === "string"
            ? parsed.totalSupply
            : null,
    };
  } catch {
    return null;
  }
}

export interface RegisterErc8004Result {
  agentId: number;
  txHash: string;
}

/**
 * Registers a new ERC-8004 agent on the identity registry via BNB MCP.
 * Returns the assigned agentId and transaction hash on success, null on failure.
 *
 * @param privateKey  Owner wallet private key (0x-prefixed)
 * @param agentUri    Public URL to the agent's metadata JSON
 * @param network     e.g. "bsc-testnet"
 */
export async function registerErc8004Agent(
  privateKey: string,
  agentUri: string,
  network: string,
): Promise<RegisterErc8004Result | null> {
  const context = await getContext();
  if (!context) {
    return null;
  }

  try {
    const result = await context.client.callTool({
      name: "register_erc8004_agent",
      arguments: {
        privateKey,
        agentURI: agentUri,
        network,
        skipConfirmation: true,
      },
    });

    const parsed = parseToolPayload(result);
    if (!parsed) {
      return null;
    }

    const agentId = parsed.agentId ?? parsed.tokenId;
    const txHash = parsed.txHash ?? parsed.transactionHash;

    if (typeof agentId !== "number" && typeof agentId !== "string") {
      return null;
    }
    if (typeof txHash !== "string") {
      return null;
    }

    return { agentId: Number(agentId), txHash };
  } catch {
    return null;
  }
}
