// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DarkMatterEscrow} from "../src/DarkMatterEscrow.sol";

contract DarkMatterEscrowTest is Test {
    address internal agentA = makeAddr("agentA");
    address internal agentB = makeAddr("agentB");
    address internal treasury = makeAddr("treasury");
    address internal outsider = makeAddr("outsider");

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(DarkMatterEscrow.ZeroAddress.selector);
        new DarkMatterEscrow(address(0), agentB, treasury, 6000, 4000);

        vm.expectRevert(DarkMatterEscrow.ZeroAddress.selector);
        new DarkMatterEscrow(agentA, agentB, address(0), 6000, 4000);
    }

    function test_constructor_revertsOnDuplicateAgents() public {
        vm.expectRevert(DarkMatterEscrow.DuplicateAgents.selector);
        new DarkMatterEscrow(agentA, agentA, treasury, 6000, 4000);
    }

    function test_constructor_revertsOnInvalidRevenueShare() public {
        vm.expectRevert(DarkMatterEscrow.InvalidRevenueShare.selector);
        new DarkMatterEscrow(agentA, agentB, treasury, 6000, 3999);
    }

    function test_approveSettlement_revertsForUnauthorizedActor() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow(agentA, agentB, treasury, 6000, 4000);

        vm.prank(outsider);
        vm.expectRevert(DarkMatterEscrow.Unauthorized.selector);
        escrow.approveSettlement();
    }

    function test_release_revertsWithoutBothApprovals() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.expectRevert(DarkMatterEscrow.MissingApprovals.selector);
        escrow.release();
    }

    function test_release_transfersFundsAfterBothApprovals() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentB);
        escrow.submitDeliveryProof(keccak256("proof"));

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.prank(agentB);
        escrow.approveSettlement();

        uint256 agentABalanceBefore = agentA.balance;
        uint256 agentBBalanceBefore = agentB.balance;
        escrow.release();

        assertEq(address(escrow).balance, 0);
        assertEq(agentA.balance, agentABalanceBefore + 0.6 ether);
        assertEq(agentB.balance, agentBBalanceBefore + 0.4 ether);
        assertTrue(escrow.released());
    }

    function test_release_revertsWithoutDeliveryProof() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.prank(agentB);
        escrow.approveSettlement();

        vm.expectRevert(DarkMatterEscrow.MissingDeliveryProof.selector);
        escrow.release();
    }

    function test_submitDeliveryProof_revertsForUnauthorizedActor() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentA);
        vm.expectRevert(DarkMatterEscrow.Unauthorized.selector);
        escrow.submitDeliveryProof(keccak256("proof"));
    }

    function test_release_revertsWhenCalledTwice() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentB);
        escrow.submitDeliveryProof(keccak256("proof"));

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.prank(agentB);
        escrow.approveSettlement();

        escrow.release();

        vm.expectRevert(DarkMatterEscrow.AlreadyReleased.selector);
        escrow.release();
    }

    function test_claimAfterTimeout_revertsForUnauthorizedActor() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.warp(block.timestamp + escrow.AUTO_CLAIM_TIMEOUT() + 1);
        vm.prank(outsider);
        vm.expectRevert(DarkMatterEscrow.Unauthorized.selector);
        escrow.claimAfterTimeout();
    }

    function test_claimAfterTimeout_revertsBeforeTimeout() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.expectRevert(DarkMatterEscrow.AutoClaimNotReady.selector);
        vm.prank(agentA);
        escrow.claimAfterTimeout();
    }

    function test_claimAfterTimeout_revertsWithoutAnyApproval() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.warp(block.timestamp + escrow.AUTO_CLAIM_TIMEOUT() + 1);
        vm.prank(agentA);
        vm.expectRevert(DarkMatterEscrow.AutoClaimNotReady.selector);
        escrow.claimAfterTimeout();
    }

    function test_claimAfterTimeout_transfersAfterSingleApprovalAndTimeout() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentA);
        escrow.approveSettlement();

        vm.warp(block.timestamp + escrow.AUTO_CLAIM_TIMEOUT() + 1);

        uint256 agentABalanceBefore = agentA.balance;
        uint256 agentBBalanceBefore = agentB.balance;

        vm.prank(agentA);
        escrow.claimAfterTimeout();

        assertEq(address(escrow).balance, 0);
        assertEq(agentA.balance, agentABalanceBefore + 0.6 ether);
        assertEq(agentB.balance, agentBBalanceBefore + 0.4 ether);
        assertTrue(escrow.released());
    }

    function test_claimAfterTimeout_revertsAfterNormalRelease() public {
        DarkMatterEscrow escrow = new DarkMatterEscrow{value: 1 ether}(agentA, agentB, treasury, 6000, 4000);

        vm.prank(agentB);
        escrow.submitDeliveryProof(keccak256("proof"));

        vm.prank(agentA);
        escrow.approveSettlement();
        vm.prank(agentB);
        escrow.approveSettlement();
        escrow.release();

        vm.warp(block.timestamp + escrow.AUTO_CLAIM_TIMEOUT() + 1);
        vm.prank(agentA);
        vm.expectRevert(DarkMatterEscrow.AlreadyReleased.selector);
        escrow.claimAfterTimeout();
    }
}
