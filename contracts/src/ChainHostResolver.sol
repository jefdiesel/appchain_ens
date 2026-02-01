// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ChainHost Resolver - Oracle-fed ethscription name → owner mapping
/// @notice Mirrors ethscription ownership from L1 onto the AppChain so any
///         contract can resolve a chainhost name to its current owner.
///         The updater bot watches the ethscriptions indexer and pushes
///         ownership changes here. When the Facet team adds a native
///         ethscription ownership predeploy, this contract can be retired
///         or pointed at the predeploy instead.
contract ChainHostResolver {
    // ============ Events ============

    event OwnerUpdated(string name, bytes32 indexed ethscriptionId, address owner);
    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ Errors ============

    error NotAdmin();
    error NotUpdater();
    error ZeroAddress();

    // ============ State ============

    address public admin;
    mapping(address => bool) public updaters;

    // ethscriptionId (sha256 of "data:,{name}") → current owner
    mapping(bytes32 => address) public owners;

    // ethscriptionId → name string (for reverse lookups / enumeration)
    mapping(bytes32 => string) public nameOf;

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyUpdater() {
        if (!updaters[msg.sender]) revert NotUpdater();
        _;
    }

    // ============ Constructor ============

    constructor() {
        admin = msg.sender;
        updaters[msg.sender] = true;
    }

    // ============ Admin ============

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function addUpdater(address updater) external onlyAdmin {
        updaters[updater] = true;
        emit UpdaterAdded(updater);
    }

    function removeUpdater(address updater) external onlyAdmin {
        updaters[updater] = false;
        emit UpdaterRemoved(updater);
    }

    // ============ Updater Functions ============

    /// @notice Update ownership for a single name
    function update(string calldata name, address owner) external onlyUpdater {
        bytes32 id = _ethscriptionId(name);
        owners[id] = owner;
        nameOf[id] = name;
        emit OwnerUpdated(name, id, owner);
    }

    /// @notice Batch update ownership for multiple names
    function updateBatch(
        string[] calldata _names,
        address[] calldata _owners
    ) external onlyUpdater {
        for (uint256 i = 0; i < _names.length; i++) {
            bytes32 id = _ethscriptionId(_names[i]);
            owners[id] = _owners[i];
            nameOf[id] = _names[i];
            emit OwnerUpdated(_names[i], id, _owners[i]);
        }
    }

    // ============ View Functions ============

    /// @notice Resolve a name to its owner address
    function resolve(string calldata name) external view returns (address) {
        return owners[_ethscriptionId(name)];
    }

    /// @notice Get the ethscription ID for a name
    function ethscriptionId(string calldata name) external pure returns (bytes32) {
        return _ethscriptionId(name);
    }

    /// @notice Check if a name is registered in the resolver
    function exists(string calldata name) external view returns (bool) {
        return owners[_ethscriptionId(name)] != address(0);
    }

    // ============ Internal ============

    /// @dev Computes sha256("data:,{name}") — the ethscription ID
    function _ethscriptionId(string calldata name) internal pure returns (bytes32) {
        return sha256(abi.encodePacked("data:,", name));
    }
}
