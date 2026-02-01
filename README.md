# AppChain ENS

Trustless name resolution for ethscriptions on the Ethscriptions AppChain.

Resolves ethscription names (like `data:,snepsid`) to their current owner address — onchain, callable by any contract.

## Architecture

```
Ethscriptions Indexer API
        ↓ (poll for transfers)
   Updater Bot (resolver-updater.js)
        ↓ (tx: updateOwner(nameHash, addr))
   ChainHostResolver Contract (AppChain)
        ↑ (call: resolve("snepsid") → 0xabc...)
   Any contract / dapp / wallet
```

**Interim**: Oracle bot watches the indexer and pushes ownership data to the resolver contract.

**Goal**: [ESIP proposal](./ESIP-ethscription-ownership-predeploy.md) for a native `EthscriptionRegistry` predeploy that eliminates the bot entirely. The derivation node already has the data — it just needs to write it into a contract.

## Contract

`contracts/src/ChainHostResolver.sol`

- `resolve(string name) → address` — resolve a name to its owner
- `exists(string name) → bool` — check if a name is registered
- `ethscriptionId(string name) → bytes32` — get the ethscription ID (sha256 of `data:,{name}`)
- `update()` / `updateBatch()` — updater bot pushes ownership data
- Admin can add/remove updaters for trust minimization

### Build

```bash
cd contracts && forge build
```

## Updater Bot

`resolver-updater.js`

Polls the ethscriptions indexer, compares against contract state, batch-updates any drift. Handles AppChain rate limits (batch size 5, exponential backoff on 429s).

### Run

```bash
cp .env.example .env
# fill in PRIVATE_KEY, RESOLVER_ADDRESS, APPCHAIN_RPC
node resolver-updater.js
```

### Config

| Env | Default | Description |
|-----|---------|-------------|
| `APPCHAIN_RPC` | `http://localhost:8545` | AppChain RPC URL |
| `RESOLVER_ADDRESS` | — | Deployed contract address |
| `PRIVATE_KEY` | — | Updater wallet private key |
| `POLL_INTERVAL` | `30` | Seconds between polls |
| `NAMES_FILE` | `./tracked-names.json` | JSON array of names to track |

## ESIP Proposal

[ESIP-ethscription-ownership-predeploy.md](./ESIP-ethscription-ownership-predeploy.md)

Proposes an `EthscriptionRegistry` predeploy at `0x4200...0100` that exposes `ownerOf(bytes32)` to the EVM. The derivation node already tracks every ethscription — this just writes it into a contract. With this ESIP, the resolver contract becomes 10 lines of Solidity with no oracle needed.
