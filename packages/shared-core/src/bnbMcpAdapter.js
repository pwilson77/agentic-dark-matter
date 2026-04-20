import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
let cachedContextPromise = null;
function parseToolPayload(toolResult) {
    if (!toolResult || typeof toolResult !== "object") {
        return null;
    }
    const content = toolResult.content;
    if (!Array.isArray(content)) {
        return null;
    }
    for (const item of content) {
        if (item?.type === "json" && item.json && typeof item.json === "object") {
            return item.json;
        }
        if (item?.type === "text" && typeof item.text === "string") {
            try {
                const parsed = JSON.parse(item.text);
                if (parsed && typeof parsed === "object") {
                    return parsed;
                }
            }
            catch {
                continue;
            }
        }
    }
    return null;
}
function parseArgs(value) {
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
export async function fetchBnbMcpChainInfo(network) {
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
        const chainId = parsed.chainId ?? null;
        const networkName = parsed.network ?? network;
        return { chainId, networkName };
    }
    catch {
        return null;
    }
}
/**
 * Calls `get_erc8004_agent` on the BNB MCP server to resolve an agent's
 * on-chain registration (owner address + agentURI).
 */
export async function resolveErc8004Agent(agentId, network) {
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
        const owner = parsed.owner ?? "";
        const tokenURI = parsed.tokenURI ?? "";
        if (!owner || !tokenURI) {
            return null;
        }
        return { agentId, owner, tokenURI };
    }
    catch {
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
export async function fetchAgentMetadata(tokenURI) {
    try {
        let json;
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
            }
            else {
                const commaIdx = tokenURI.indexOf(",");
                json =
                    commaIdx !== -1
                        ? decodeURIComponent(tokenURI.slice(commaIdx + 1))
                        : tokenURI;
            }
        }
        else if (tokenURI.startsWith("ipfs://")) {
            const cid = tokenURI.slice("ipfs://".length);
            const gateways = [
                `https://ipfs.io/ipfs/${cid}`,
                `https://cloudflare-ipfs.com/ipfs/${cid}`,
                `https://gateway.pinata.cloud/ipfs/${cid}`,
            ];
            let fetched = null;
            for (const gw of gateways) {
                try {
                    const resp = await fetch(gw, { signal: AbortSignal.timeout(8000) });
                    if (resp.ok) {
                        fetched = await resp.text();
                        break;
                    }
                }
                catch {
                    continue;
                }
            }
            if (!fetched)
                return null;
            json = fetched;
        }
        else if (tokenURI.startsWith("ar://")) {
            const txId = tokenURI.slice("ar://".length);
            const resp = await fetch(`https://arweave.net/${txId}`, {
                signal: AbortSignal.timeout(8000),
            });
            if (!resp.ok)
                return null;
            json = await resp.text();
        }
        else if (tokenURI.startsWith("http://") ||
            tokenURI.startsWith("https://")) {
            const resp = await fetch(tokenURI, { signal: AbortSignal.timeout(8000) });
            if (!resp.ok)
                return null;
            json = await resp.text();
        }
        else {
            // plain JSON stored directly as tokenURI
            json = tokenURI;
        }
        const parsed = JSON.parse(json);
        return parsed;
    }
    catch {
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
export async function discoverAgentsByCapability(capability, network, scanRange = 20) {
    const term = capability.toLowerCase().replace(/-/g, " ");
    const results = [];
    const checks = Array.from({ length: scanRange }, (_, i) => resolveErc8004Agent(i + 1, network));
    const refs = await Promise.allSettled(checks);
    for (const settled of refs) {
        if (settled.status !== "fulfilled" || !settled.value)
            continue;
        const ref = settled.value;
        const metadata = await fetchAgentMetadata(ref.tokenURI);
        if (!metadata)
            continue;
        if (metadata.active === false)
            continue;
        const services = metadata.services ?? metadata.endpoints ?? [];
        const matchedCapabilities = [];
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
                    if (tool.toLowerCase().includes(term))
                        matchedCapabilities.push(tool);
                }
            }
        }
        // name / description fallback
        const desc = `${metadata.name ?? ""} ${metadata.description ?? ""}`.toLowerCase();
        if (matchedCapabilities.length === 0 && desc.includes(term)) {
            matchedCapabilities.push(metadata.name ?? "name-match");
        }
        if (matchedCapabilities.length === 0)
            continue;
        // extract agentWallet from services
        const walletSvc = services.find((s) => s.name === "agentWallet");
        const agentWallet = walletSvc?.endpoint
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
export async function fetchBnbMcpTokenMetadata(tokenAddress, network) {
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
            decimals: typeof parsed.decimals === "number"
                ? parsed.decimals
                : typeof parsed.decimals === "string"
                    ? Number(parsed.decimals)
                    : null,
            totalSupply: typeof parsed.formattedTotalSupply === "string"
                ? parsed.formattedTotalSupply
                : typeof parsed.totalSupply === "string"
                    ? parsed.totalSupply
                    : null,
        };
    }
    catch {
        return null;
    }
}
