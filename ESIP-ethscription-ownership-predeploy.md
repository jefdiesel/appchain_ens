# ESIP-X: Ethscription Ownership Predeploy

**Discussion:** [GitHub Issue TBD]

## Abstract

This proposal adds a predeploy contract to the Ethscriptions AppChain that exposes ethscription ownership to the EVM. The derivation node already tracks every ethscription creation and transfer — this ESIP makes that data readable by Solidity contracts via a simple `ownerOf(bytes32)` interface.

Currently, ethscription ownership data is trapped inside the derivation pipeline. Smart contracts on the AppChain cannot look up who owns an ethscription. This forces developers to build off-chain oracles to bridge ownership data back onchain — defeating the purpose of having an EVM-compatible L2.

## Motivation

The AppChain's value proposition is "standard tooling works out of the box" and "smart contract composability." But the most fundamental piece of ethscription state — **who owns what** — is invisible to the EVM.

This blocks real use cases:

1. **Name resolution** — A contract that resolves `data:,snepsid` to its owner address, enabling ENS-style name systems built on ethscriptions
2. **Onchain marketplaces** — Contracts that can verify ownership before executing trades, without trusting an off-chain indexer
3. **Composable protocols** — Any contract that needs to gate logic on "does this address own this ethscription?"
4. **Trustless bridges** — Verifying ethscription ownership onchain before bridging assets

All of these currently require an off-chain oracle bot to feed data into a contract. The derivation node already has this data. It just needs to write it into a predeploy.

## Specification

### Predeploy Contract

Deploy an `EthscriptionRegistry` contract at a deterministic address (e.g., `0x4200000000000000000000000000000000000100`) with the following interface:

```solidity
interface IEthscriptionRegistry {
    /// @notice Returns the current owner of an ethscription
    /// @param ethscriptionId The sha256 hash of the ethscription content URI
    /// @return owner The current owner address, or address(0) if not found
    function ownerOf(bytes32 ethscriptionId) external view returns (address owner);

    /// @notice Returns the creator of an ethscription
    /// @param ethscriptionId The sha256 hash of the ethscription content URI
    /// @return creator The address that created the ethscription
    function creatorOf(bytes32 ethscriptionId) external view returns (address creator);

    /// @notice Returns whether an ethscription exists
    /// @param ethscriptionId The sha256 hash of the ethscription content URI
    /// @return True if the ethscription has been created
    function exists(bytes32 ethscriptionId) external view returns (bool);

    /// @notice Returns the block number at which the ethscription was created
    /// @param ethscriptionId The sha256 hash of the ethscription content URI
    /// @return L1 block number of creation
    function creationBlock(bytes32 ethscriptionId) external view returns (uint256);

    /// @notice Emitted when an ethscription is created
    event EthscriptionCreated(
        bytes32 indexed ethscriptionId,
        address indexed creator,
        address indexed initialOwner,
        uint256 l1BlockNumber
    );

    /// @notice Emitted when an ethscription is transferred
    event EthscriptionTransferred(
        bytes32 indexed ethscriptionId,
        address indexed from,
        address indexed to
    );
}
```

### Derivation Node Changes

When the derivation node processes an L1 block and identifies ethscription events (creations and transfers), it MUST also generate deposit transactions that update the `EthscriptionRegistry` predeploy:

1. **On ethscription creation**: Call an internal `_create(bytes32 id, address creator, address initialOwner, uint256 l1Block)` function that sets ownership and emits `EthscriptionCreated`
2. **On ethscription transfer**: Call an internal `_transfer(bytes32 id, address from, address to)` function that updates ownership and emits `EthscriptionTransferred`

These are system-level deposit transactions (from `address(0)` or a designated system address), not user-initiated.

### Storage Layout

```solidity
mapping(bytes32 => address) public owners;      // ethscriptionId → current owner
mapping(bytes32 => address) public creators;     // ethscriptionId → creator
mapping(bytes32 => uint256) public createdAt;    // ethscriptionId → L1 block number
```

### Querying

Any contract on the AppChain can resolve an ethscription name to its owner:

```solidity
IEthscriptionRegistry registry = IEthscriptionRegistry(0x4200000000000000000000000000000000000100);

// Resolve a chainhost name
bytes32 id = sha256(abi.encodePacked("data:,snepsid"));
address owner = registry.ownerOf(id);

// Check if an ethscription exists
bool found = registry.exists(id);
```

This is a free `eth_call` — no gas, no transaction, instant.

## Rationale

### Why a predeploy, not a precompile?

A predeploy is a regular Solidity contract placed at a known address at genesis. It stores data in normal EVM storage slots. This means:

- Standard tooling works (ethers.js, viem, Foundry, any ABI decoder)
- Events are queryable via `eth_getLogs`
- Storage is Merkle-provable
- No geth modifications needed — only derivation node changes

A precompile would require modifying geth's Go code, which is harder to maintain and audit.

### Why expose ownership specifically?

Ownership is the most fundamental and universally useful piece of ethscription state. Content URIs are already derivable (you know what you're looking up). Creation metadata is useful but secondary. Ownership is what enables composability.

### What about content data?

Content URIs can be large (images, HTML). Storing full content in EVM storage would be expensive and is not necessary for most use cases. The ethscription ID (sha256 of content URI) already serves as a unique identifier. Full content retrieval can remain off-chain or be added in a future ESIP.

### Backwards compatibility

This is purely additive. No existing behavior changes. The predeploy is deployed at genesis or added via a hard fork at a specific L2 block number. Existing contracts and users are unaffected.

## Example: Name Resolver Contract

With this ESIP, a trustless name resolver becomes trivial:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEthscriptionRegistry {
    function ownerOf(bytes32 ethscriptionId) external view returns (address);
    function exists(bytes32 ethscriptionId) external view returns (bool);
}

/// @title ChainHost Name Resolver
/// @notice Resolves ethscription names to owner addresses using the
///         EthscriptionRegistry predeploy. No oracle, no off-chain bot.
contract ChainHostResolver {
    IEthscriptionRegistry constant REGISTRY =
        IEthscriptionRegistry(0x4200000000000000000000000000000000000100);

    /// @notice Resolve a name to its current owner
    function resolve(string calldata name) external view returns (address) {
        bytes32 id = sha256(abi.encodePacked("data:,", name));
        return REGISTRY.ownerOf(id);
    }

    /// @notice Check if a name is registered (ethscription exists)
    function exists(string calldata name) external view returns (bool) {
        bytes32 id = sha256(abi.encodePacked("data:,", name));
        return REGISTRY.exists(id);
    }
}
```

Zero infrastructure. Zero trust assumptions. Just a view call.

## Security Considerations

- The predeploy is **read-only** from the perspective of user transactions. Only system deposit transactions from the derivation node can modify state.
- Ownership data is deterministically derived from L1 — anyone running a node can verify the state independently.
- The contract does not hold funds or control assets. It is purely informational.
- Incorrect ownership data would require a bug in the derivation node, which would affect all AppChain state equally (not specific to this predeploy).
