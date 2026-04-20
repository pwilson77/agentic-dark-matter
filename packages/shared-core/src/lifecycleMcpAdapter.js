import { resolveRailAdapter } from "./railResolver.js";
export async function createAgreementViaMcp(input) {
    const rail = resolveRailAdapter({
        railId: input.railId,
        network: input.network,
    });
    return rail.createAgreement(input);
}
export async function inspectStatusViaMcp(input) {
    const rail = resolveRailAdapter({ railId: input.railId });
    return rail.inspectStatus(input);
}
export async function inspectTimelineViaMcp(input) {
    const rail = resolveRailAdapter({ railId: input.railId });
    return rail.inspectTimeline(input);
}
export async function approveSettlementViaMcp(input) {
    const rail = resolveRailAdapter({ railId: input.railId });
    return rail.approveSettlement(input);
}
export async function releaseViaMcp(input) {
    const rail = resolveRailAdapter({ railId: input.railId });
    return rail.release(input);
}
export async function autoClaimTimeoutViaMcp(input) {
    const rail = resolveRailAdapter({ railId: input.railId });
    return rail.claimAfterTimeout(input);
}
