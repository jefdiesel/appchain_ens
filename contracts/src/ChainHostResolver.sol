// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ChainHost Resolver - Trustless ethscription name → owner resolution
/// @notice Resolves chainhost names to their owner addresses by reading directly
///         from the Ethscriptions contract on the AppChain. No oracle, no bot,
///         no admin. Just view calls.
///
///         Flow: name → sha256("data:,{name}") → firstEthscriptionByContentUri → ownerOf

interface IEthscriptions {
    function firstEthscriptionByContentUri(bytes32 contentSha) external view returns (bytes32);
    function ownerOf(bytes32 ethscriptionId) external view returns (address);
    function exists(bytes32 ethscriptionId) external view returns (bool);
}

contract ChainHostResolver {
    IEthscriptions public constant ETHSCRIPTIONS =
        IEthscriptions(0x3300000000000000000000000000000000000001);

    /// @notice Resolve a name to its current owner address
    /// @param name The name to resolve (e.g. "snepsid")
    /// @return owner The current owner, or address(0) if not inscribed
    function resolve(string calldata name) external view returns (address owner) {
        bytes32 sha = sha256(abi.encodePacked("data:,", name));
        bytes32 id = ETHSCRIPTIONS.firstEthscriptionByContentUri(sha);
        if (id == bytes32(0)) return address(0);
        return ETHSCRIPTIONS.ownerOf(id);
    }

    /// @notice Check if a name has been inscribed
    function exists(string calldata name) external view returns (bool) {
        bytes32 sha = sha256(abi.encodePacked("data:,", name));
        bytes32 id = ETHSCRIPTIONS.firstEthscriptionByContentUri(sha);
        if (id == bytes32(0)) return false;
        return ETHSCRIPTIONS.exists(id);
    }

    /// @notice Get the ethscription ID for a name
    function ethscriptionId(string calldata name) external view returns (bytes32) {
        bytes32 sha = sha256(abi.encodePacked("data:,", name));
        return ETHSCRIPTIONS.firstEthscriptionByContentUri(sha);
    }

    /// @notice Get the content SHA for a name (useful for debugging)
    function contentSha(string calldata name) external pure returns (bytes32) {
        return sha256(abi.encodePacked("data:,", name));
    }
}
