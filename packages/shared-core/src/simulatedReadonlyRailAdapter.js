import { Wallet } from "ethers";
import { inspectStatusFromSessionApi, inspectTimelineFromSessionApi, } from "./sessionApiHelpers.js";
const simulatedPoolsByContract = new Map();
function nowIso() {
    return new Date().toISOString();
}
async function sha256Hex(input) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
async function makePseudoAddress(seed) {
    const hash = await sha256Hex(seed);
    return `0x${hash.slice(0, 40)}`;
}
async function makePseudoTxHash(seed) {
    const hash = await sha256Hex(seed);
    return `0x${hash.slice(0, 64)}`;
}
function getSignerAddress(privateKey) {
    try {
        return new Wallet(privateKey).address;
    }
    catch {
        return "0x0000000000000000000000000000000000000000";
    }
}
function pushTimeline(state, title, detail, status) {
    state.timeline.push({
        id: `${state.poolId}-${state.timeline.length + 1}`,
        title,
        detail,
        at: nowIso(),
        status,
    });
}
function findState(input) {
    const contractAddress = input.contractAddress.toLowerCase();
    const state = simulatedPoolsByContract.get(contractAddress);
    if (!state) {
        throw new Error(`simulated rail pool not found for ${input.contractAddress}`);
    }
    return state;
}
export const simulatedReadonlyRailAdapter = {
    railId: "simulated-readonly",
    async createAgreement(input) {
        const deployedAt = nowIso();
        const agreementId = input.agreementId || `sim-${Date.now()}`;
        const contractAddress = await makePseudoAddress(`contract:${agreementId}:${deployedAt}`);
        const deploymentTxHash = await makePseudoTxHash(`deploy:${agreementId}:${deployedAt}`);
        const agreementHash = await sha256Hex(JSON.stringify({
            agreementId,
            network: input.network,
            deployedAt,
            contractAddress,
            transcriptHash: input.transcriptArtifact.transcriptHash,
        }));
        const artifact = {
            agreementId,
            agreementHash,
            network: input.network,
            contractType: "DarkMatterEscrow",
            deployedAt,
            dryRun: true,
            deployer: input.participants[0]?.erc8004Id || "simulated:deployer",
            transcriptHash: input.transcriptArtifact.transcriptHash,
            transcriptStorageRef: input.transcriptArtifact.storageRef,
            transcriptArtifactHash: input.transcriptArtifact.artifactHash,
            terms: input.terms,
            participants: input.participants,
            contractAddress,
            deploymentTxHash,
            deploymentBlockNumber: undefined,
            chainId: input.onChain?.chainId,
        };
        const poolId = `sim-${agreementId.slice(-8)}`;
        const state = {
            poolId,
            contractAddress: contractAddress.toLowerCase(),
            agreement: artifact,
            approvals: new Set(),
            released: false,
            timeoutClaimed: false,
            timeline: [],
        };
        pushTimeline(state, "Simulated agreement created", `Agreement ${agreementId} initialized.`, "ok");
        simulatedPoolsByContract.set(state.contractAddress, state);
        return artifact;
    },
    async approveSettlement(_input) {
        const state = findState(_input);
        if (state.released || state.timeoutClaimed) {
            throw new Error("simulated pool already settled");
        }
        const signer = getSignerAddress(_input.signerPrivateKey).toLowerCase();
        state.approvals.add(signer);
        const txHash = await makePseudoTxHash(`approve:${state.poolId}:${signer}:${Date.now()}`);
        pushTimeline(state, "Simulated approval", `Approval recorded from ${signer}. Count=${state.approvals.size}`, "ok");
        return {
            contractAddress: state.contractAddress,
            signer,
            txHash,
        };
    },
    async release(_input) {
        const state = findState(_input);
        if (state.released) {
            throw new Error("simulated pool already released");
        }
        if (state.timeoutClaimed) {
            throw new Error("simulated pool already timeout-claimed");
        }
        if (state.approvals.size < 2) {
            throw new Error("simulated release requires two approvals");
        }
        const signer = getSignerAddress(_input.signerPrivateKey).toLowerCase();
        state.released = true;
        const txHash = await makePseudoTxHash(`release:${state.poolId}:${signer}:${Date.now()}`);
        pushTimeline(state, "Simulated release", `Settlement released by ${signer}.`, "ok");
        return {
            contractAddress: state.contractAddress,
            signer,
            txHash,
        };
    },
    async claimAfterTimeout(_input) {
        const state = findState(_input);
        if (state.released) {
            throw new Error("simulated pool already released");
        }
        if (state.timeoutClaimed) {
            throw new Error("simulated pool already timeout-claimed");
        }
        if (state.approvals.size < 1) {
            throw new Error("simulated timeout claim requires at least one approval");
        }
        const signer = getSignerAddress(_input.signerPrivateKey).toLowerCase();
        state.timeoutClaimed = true;
        const txHash = await makePseudoTxHash(`timeout:${state.poolId}:${signer}:${Date.now()}`);
        pushTimeline(state, "Simulated timeout claim", `Timeout claim executed by ${signer}.`, "warn");
        return {
            contractAddress: state.contractAddress,
            signer,
            txHash,
        };
    },
    async inspectStatus(input) {
        const contractAddress = String(input.contractAddress || "").toLowerCase();
        if (contractAddress && simulatedPoolsByContract.has(contractAddress)) {
            const state = simulatedPoolsByContract.get(contractAddress);
            return {
                source: "simulated",
                generatedAt: nowIso(),
                selectedPoolId: state.poolId,
                pool: {
                    id: state.poolId,
                    status: state.released || state.timeoutClaimed ? "completed" : "settling",
                    settlement: {
                        contractAddress: state.contractAddress,
                    },
                    timeline: state.timeline,
                    meta: {
                        approvals: state.approvals.size,
                        released: state.released,
                        timeoutClaimed: state.timeoutClaimed,
                        simulated: true,
                    },
                },
            };
        }
        return inspectStatusFromSessionApi(input, "mock");
    },
    async inspectTimeline(input) {
        const contractAddress = String(input.contractAddress || "").toLowerCase();
        if (contractAddress && simulatedPoolsByContract.has(contractAddress)) {
            const state = simulatedPoolsByContract.get(contractAddress);
            const sinceCursor = Number.isFinite(input.sinceCursor)
                ? Number(input.sinceCursor)
                : 0;
            const start = Math.max(0, sinceCursor);
            const events = state.timeline.slice(start).map((event, index) => ({
                cursor: start + index + 1,
                poolId: state.poolId,
                poolName: "Simulated Rail Pool",
                event,
            }));
            return {
                source: "simulated",
                generatedAt: nowIso(),
                cursor: state.timeline.length,
                events,
            };
        }
        return inspectTimelineFromSessionApi(input, "mock");
    },
};
