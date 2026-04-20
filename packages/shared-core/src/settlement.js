import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
const ESCROW_ABI = [
    "function agentA() view returns (address)",
    "function agentB() view returns (address)",
    "function treasury() view returns (address)",
    "function released() view returns (bool)",
    "function AUTO_CLAIM_TIMEOUT() view returns (uint64)",
    "function approveSettlement()",
    "function release()",
    "function claimAfterTimeout()",
];
function normalizeAddress(address) {
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        throw new Error(`Invalid EVM address: ${address}`);
    }
    return trimmed.toLowerCase();
}
function assertSignerAddressMatches(actual, expected, label) {
    if (normalizeAddress(actual) !== normalizeAddress(expected)) {
        throw new Error(`${label} private key does not match expected signer address. expected=${expected} actual=${actual}`);
    }
}
export async function executeSettlement(input) {
    const provider = new JsonRpcProvider(input.rpcUrl);
    const contractAddress = normalizeAddress(input.contractAddress);
    const agentAWallet = new Wallet(input.agentAPrivateKey, provider);
    const agentBWallet = new Wallet(input.agentBPrivateKey, provider);
    const managedAgentA = new NonceManager(agentAWallet);
    const managedAgentB = new NonceManager(agentBWallet);
    const contractReader = new Contract(contractAddress, ESCROW_ABI, provider);
    const [agentAOnChain, agentBOnChain, treasuryAddress] = await Promise.all([
        contractReader.agentA(),
        contractReader.agentB(),
        contractReader.treasury(),
    ]);
    assertSignerAddressMatches(agentAWallet.address, input.expectedAgentAAddress, "agentA");
    assertSignerAddressMatches(agentBWallet.address, input.expectedAgentBAddress, "agentB");
    assertSignerAddressMatches(agentAOnChain, input.expectedAgentAAddress, "agentA");
    assertSignerAddressMatches(agentBOnChain, input.expectedAgentBAddress, "agentB");
    const treasuryBalanceBefore = await provider.getBalance(treasuryAddress);
    const mode = input.mode || "standard";
    const contractAsA = new Contract(contractAddress, ESCROW_ABI, managedAgentA);
    const contractAsB = new Contract(contractAddress, ESCROW_ABI, managedAgentB);
    const approveTxA = await contractAsA.approveSettlement();
    await approveTxA.wait();
    let approveTxBHash = null;
    let settlementTxHash = "";
    if (mode === "standard") {
        const approveTxB = await contractAsB.approveSettlement();
        await approveTxB.wait();
        approveTxBHash = approveTxB.hash;
        const releaseTx = await contractAsA.release();
        await releaseTx.wait();
        settlementTxHash = releaseTx.hash;
    }
    else {
        const timeoutSeconds = Number((await contractReader.AUTO_CLAIM_TIMEOUT()));
        await provider.send("evm_increaseTime", [timeoutSeconds + 1]);
        await provider.send("evm_mine", []);
        const claimTx = await contractAsA.claimAfterTimeout();
        await claimTx.wait();
        settlementTxHash = claimTx.hash;
    }
    const [treasuryBalanceAfter, released] = await Promise.all([
        provider.getBalance(treasuryAddress),
        contractReader.released(),
    ]);
    return {
        contractAddress,
        treasuryAddress,
        mode,
        agentAApproveTxHash: approveTxA.hash,
        agentBApproveTxHash: approveTxBHash,
        releaseTxHash: settlementTxHash,
        treasuryBalanceBefore: treasuryBalanceBefore.toString(),
        treasuryBalanceAfter: treasuryBalanceAfter.toString(),
        released,
    };
}
