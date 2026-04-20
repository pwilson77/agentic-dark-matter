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
    registrations?: Array<{
        agentId?: number;
        agentRegistry?: string;
    }>;
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
export declare function fetchBnbMcpChainInfo(network: string): Promise<BnbMcpChainInfo | null>;
/**
 * Calls `get_erc8004_agent` on the BNB MCP server to resolve an agent's
 * on-chain registration (owner address + agentURI).
 */
export declare function resolveErc8004Agent(agentId: number, network: string): Promise<Erc8004AgentRef | null>;
/**
 * Resolves an agentURI to its JSON metadata.  Handles:
 *   data:application/json;base64,<B64>
 *   data:application/json,<JSON>
 *   https:// / http://
 *   ipfs://  (via public gateway)
 *   ar://    (via arweave.net)
 */
export declare function fetchAgentMetadata(tokenURI: string): Promise<Erc8004AgentMetadata | null>;
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
export declare function discoverAgentsByCapability(capability: string, network: string, scanRange?: number): Promise<Erc8004DiscoveredAgent[]>;
export declare function fetchBnbMcpTokenMetadata(tokenAddress: string, network: string): Promise<BnbMcpTokenMetadata | null>;
