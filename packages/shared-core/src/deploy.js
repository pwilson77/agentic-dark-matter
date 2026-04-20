import { readFile } from "node:fs/promises";
import { ContractFactory, JsonRpcProvider, Wallet, } from "ethers";
const ZERO_X_PREFIX = "0x";
function ensureHexAddress(value, label) {
    const normalized = value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
        throw new Error(`Invalid ${label}: expected 20-byte 0x-prefixed address.`);
    }
    return normalized;
}
function ensureHexPrivateKey(value) {
    const normalized = value.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
        throw new Error("Invalid deployer private key: expected 32-byte 0x-prefixed hex.");
    }
    return normalized;
}
async function loadCompiledEscrowArtifact(contractsDir) {
    const artifactPath = `${contractsDir}/out/DarkMatterEscrow.sol/DarkMatterEscrow.json`;
    const raw = await readFile(artifactPath, "utf8");
    return JSON.parse(raw);
}
async function deployWithFoundry(terms, onChain) {
    const agentAAddress = ensureHexAddress(onChain.agentAAddress, "agentAAddress");
    const agentBAddress = ensureHexAddress(onChain.agentBAddress, "agentBAddress");
    const treasuryAddress = ensureHexAddress(terms.treasuryAddress, "terms.treasuryAddress");
    const privateKey = ensureHexPrivateKey(onChain.privateKey);
    const artifact = await loadCompiledEscrowArtifact(onChain.contractsDir);
    const bytecode = artifact.bytecode?.object;
    if (!bytecode || !bytecode.startsWith(ZERO_X_PREFIX)) {
        throw new Error("Compiled DarkMatterEscrow artifact is missing deployable bytecode.");
    }
    const provider = new JsonRpcProvider(onChain.rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const factory = new ContractFactory(artifact.abi, bytecode, wallet);
    const contract = await factory.deploy(agentAAddress, agentBAddress, treasuryAddress, terms.revenueShareBpsAgentA, terms.revenueShareBpsAgentB, { value: BigInt(onChain.valueWei) });
    const deploymentTx = contract.deploymentTransaction();
    if (!deploymentTx) {
        throw new Error("Deployment transaction was not created.");
    }
    const receipt = await deploymentTx.wait();
    if (!receipt || !receipt.contractAddress || !receipt.hash) {
        throw new Error("Deployment transaction did not produce a contract receipt.");
    }
    return {
        contractAddress: ensureHexAddress(receipt.contractAddress, "contractAddress"),
        deploymentTxHash: receipt.hash.startsWith(ZERO_X_PREFIX)
            ? receipt.hash
            : `${ZERO_X_PREFIX}${receipt.hash}`,
        deploymentBlockNumber: receipt.blockNumber,
    };
}
async function sha256Hex(input) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
export async function deployDarkMatterAgreement(input) {
    let onChainDeployment;
    if (!input.dryRun) {
        if (!input.onChain) {
            throw new Error("onChain deployment config is required when dryRun is false.");
        }
        onChainDeployment = await deployWithFoundry(input.terms, input.onChain);
    }
    const deployedAt = new Date().toISOString();
    const basePayload = {
        agreementId: input.agreementId,
        network: input.network,
        contractType: "DarkMatterEscrow",
        deployedAt,
        dryRun: input.dryRun,
        deployer: input.participants[0].erc8004Id,
        transcriptHash: input.transcriptArtifact.transcriptHash,
        transcriptStorageRef: input.transcriptArtifact.storageRef,
        transcriptArtifactHash: input.transcriptArtifact.artifactHash,
        terms: input.terms,
        participants: input.participants,
        contractAddress: onChainDeployment?.contractAddress,
        deploymentTxHash: onChainDeployment?.deploymentTxHash,
        deploymentBlockNumber: onChainDeployment?.deploymentBlockNumber,
        chainId: input.onChain?.chainId,
    };
    const agreementHash = await sha256Hex(JSON.stringify(basePayload));
    return {
        ...basePayload,
        agreementHash,
    };
}
