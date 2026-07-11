// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title InferMartEscrow — a receipt-anchored payment channel for P2P inference.
/// @notice The buyer deposits USDT once per seller. After each inference leg the
///         buyer verifies the provider-signed usage receipt off-chain, then signs
///         an EIP-712 voucher whose `receiptHash` commits to that exact receipt.
///         The seller (or anyone relaying for it — payout only ever goes to the
///         seller) submits the latest voucher to claim the cumulative amount.
///         Every on-chain claim is therefore traceable to one provider-signed
///         receipt, not inferred from a balance change.
///
///         Self-contained on purpose (no imports) so it compiles with bare solc,
///         like MockUSDT.sol. Testnet demo code: reviewed, tested end-to-end on
///         Sepolia, but not audited.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract InferMartEscrow {
    struct Channel {
        address buyer;
        address seller;
        address token;
        uint256 deposited; // total ever deposited in this epoch
        uint256 claimed;   // total already paid out to the seller in this epoch
        uint64 epoch;      // bumped on refund so stale vouchers can never replay
        uint64 closeAt;    // 0 = open; otherwise timestamp after which buyer may refund
    }

    uint64 public constant CHALLENGE_PERIOD = 1 hours;

    mapping(bytes32 => Channel) public channels;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(bytes32 channelId,uint64 epoch,uint256 cumulativeAmount,bytes32 receiptHash)");

    event Opened(bytes32 indexed channelId, address indexed buyer, address indexed seller, address token, uint256 amount, uint64 epoch);
    event Claimed(bytes32 indexed channelId, uint64 epoch, uint256 cumulativeAmount, uint256 paidOut, bytes32 receiptHash);
    event CloseStarted(bytes32 indexed channelId, uint64 closeAt);
    event Refunded(bytes32 indexed channelId, uint256 amount, uint64 newEpoch);

    bool private locked;
    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("InferMartEscrow")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function channelId(address buyer, address seller, address token) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(buyer, seller, token));
    }

    /// @notice Deposit into (or top up) the channel between msg.sender and `seller`.
    function open(address seller, address token, uint256 amount) external nonReentrant {
        require(seller != address(0) && token != address(0), "bad params");
        require(amount > 0, "zero amount");
        bytes32 id = channelId(msg.sender, seller, token);
        Channel storage ch = channels[id];
        if (ch.buyer == address(0)) {
            ch.buyer = msg.sender;
            ch.seller = seller;
            ch.token = token;
        }
        require(ch.closeAt == 0, "closing");
        ch.deposited += amount;
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Opened(id, msg.sender, seller, token, amount, ch.epoch);
    }

    /// @notice Pay the seller up to `cumulativeAmount`, authorized by the buyer's
    ///         EIP-712 signature over a voucher anchored to a provider receipt.
    ///         Callable by anyone: the voucher only ever pays the channel's seller,
    ///         so relaying a claim needs no trust (and the seller needs no ETH).
    function claim(
        bytes32 id,
        uint64 epoch,
        uint256 cumulativeAmount,
        bytes32 receiptHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Channel storage ch = channels[id];
        require(ch.buyer != address(0), "no channel");
        require(epoch == ch.epoch, "stale epoch");
        require(cumulativeAmount > ch.claimed, "nothing new");
        require(cumulativeAmount <= ch.deposited, "exceeds deposit");

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(VOUCHER_TYPEHASH, id, epoch, cumulativeAmount, receiptHash))
            )
        );
        // Reject malleable signatures (high-s), then recover.
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "bad s");
        require(v == 27 || v == 28, "bad v");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == ch.buyer, "bad signature");

        uint256 delta = cumulativeAmount - ch.claimed;
        ch.claimed = cumulativeAmount;
        require(IERC20(ch.token).transfer(ch.seller, delta), "payout failed");
        emit Claimed(id, epoch, cumulativeAmount, delta, receiptHash);
    }

    /// @notice Buyer signals intent to exit; the seller has CHALLENGE_PERIOD to
    ///         submit its final voucher before the buyer can take the remainder.
    function startClose(bytes32 id) external {
        Channel storage ch = channels[id];
        require(msg.sender == ch.buyer, "not buyer");
        require(ch.closeAt == 0, "already closing");
        ch.closeAt = uint64(block.timestamp) + CHALLENGE_PERIOD;
        emit CloseStarted(id, ch.closeAt);
    }

    /// @notice After the challenge window the buyer reclaims the unspent balance.
    ///         The epoch bump makes every voucher from the old epoch unusable, so
    ///         a re-opened channel can never replay old claims.
    function refund(bytes32 id) external nonReentrant {
        Channel storage ch = channels[id];
        require(msg.sender == ch.buyer, "not buyer");
        require(ch.closeAt != 0 && block.timestamp >= ch.closeAt, "challenge running");
        uint256 remainder = ch.deposited - ch.claimed;
        ch.deposited = 0;
        ch.claimed = 0;
        ch.closeAt = 0;
        ch.epoch += 1;
        if (remainder > 0) {
            require(IERC20(ch.token).transfer(ch.buyer, remainder), "refund failed");
        }
        emit Refunded(id, remainder, ch.epoch);
    }
}
