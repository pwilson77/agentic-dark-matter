// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DarkMatterEscrow {
    uint64 public constant AUTO_CLAIM_TIMEOUT = 1 days;

    bytes32 public immutable poolId;
    address public immutable agentA;
    address public immutable agentB;
    address public immutable treasury;
    uint64 public immutable autoClaimAt;
    uint16 public immutable revenueShareBpsAgentA;
    uint16 public immutable revenueShareBpsAgentB;

    bool public agentAApproved;
    bool public agentBApproved;
    bool public released;

    error Unauthorized();
    error ZeroAddress();
    error DuplicateAgents();
    error InvalidRevenueShare();
    error AlreadyReleased();
    error MissingApprovals();
    error AutoClaimNotReady();
    error TransferFailed();

    event AgreementCreated(
        address indexed agentA,
        address indexed agentB,
        address indexed treasury,
        uint16 revenueShareBpsAgentA,
        uint16 revenueShareBpsAgentB,
        uint256 initialBalance
    );
    event SettlementApproved(address indexed approver, bool agentAApproved, bool agentBApproved);
    event SettlementReleased(address indexed treasury, uint256 amount, address indexed triggeredBy);
    event SettlementAutoClaimed(address indexed claimer, address indexed treasury, uint256 amount);
    event PoolCreated(bytes32 indexed poolId, address indexed contractAddress, string status, uint256 balance);
    event PoolStatusChanged(bytes32 indexed poolId, string status, address indexed actor);

    constructor(
        address _agentA,
        address _agentB,
        address _treasury,
        uint16 _revenueShareBpsAgentA,
        uint16 _revenueShareBpsAgentB
    ) payable {
        if (_agentA == address(0) || _agentB == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        if (_agentA == _agentB) {
            revert DuplicateAgents();
        }
        if (_revenueShareBpsAgentA + _revenueShareBpsAgentB != 10_000) {
            revert InvalidRevenueShare();
        }

        agentA = _agentA;
        agentB = _agentB;
        treasury = _treasury;
        revenueShareBpsAgentA = _revenueShareBpsAgentA;
        revenueShareBpsAgentB = _revenueShareBpsAgentB;
        autoClaimAt = uint64(block.timestamp + AUTO_CLAIM_TIMEOUT);
        poolId = keccak256(
            abi.encodePacked(
                block.chainid,
                _agentA,
                _agentB,
                _treasury,
                _revenueShareBpsAgentA,
                _revenueShareBpsAgentB,
                address(this)
            )
        );

        emit AgreementCreated(
            _agentA,
            _agentB,
            _treasury,
            _revenueShareBpsAgentA,
            _revenueShareBpsAgentB,
            msg.value
        );
        emit PoolCreated(poolId, address(this), "created", msg.value);
    }

    function approveSettlement() external {
        if (msg.sender == agentA) {
            agentAApproved = true;
            emit SettlementApproved(msg.sender, agentAApproved, agentBApproved);
            emit PoolStatusChanged(poolId, "agentA-approved", msg.sender);
            return;
        }
        if (msg.sender == agentB) {
            agentBApproved = true;
            emit SettlementApproved(msg.sender, agentAApproved, agentBApproved);
            emit PoolStatusChanged(poolId, "agentB-approved", msg.sender);
            return;
        }
        revert Unauthorized();
    }

    function release() external {
        if (released) {
            revert AlreadyReleased();
        }
        if (!(agentAApproved && agentBApproved)) {
            revert MissingApprovals();
        }

        uint256 amount = address(this).balance;
        released = true;

        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) {
            revert TransferFailed();
        }

        emit SettlementReleased(treasury, amount, msg.sender);
        emit PoolStatusChanged(poolId, "released", msg.sender);
    }

    function claimAfterTimeout() external {
        if (released) {
            revert AlreadyReleased();
        }
        if (msg.sender != agentA && msg.sender != agentB) {
            revert Unauthorized();
        }
        if (block.timestamp < autoClaimAt) {
            revert AutoClaimNotReady();
        }
        if (!(agentAApproved || agentBApproved)) {
            revert AutoClaimNotReady();
        }

        uint256 amount = address(this).balance;
        released = true;

        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) {
            revert TransferFailed();
        }

        emit SettlementAutoClaimed(msg.sender, treasury, amount);
        emit PoolStatusChanged(poolId, "auto-claimed-timeout", msg.sender);
    }
}
