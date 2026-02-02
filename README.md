# AppChain ENS

Trustless ethscription name resolution on the Ethscriptions AppChain.

Resolves any ethscription name (like `data:,snepsid`) to its current owner address — fully onchain, no oracle, no bot.

## How It Works

The [Ethscriptions contract](https://explorer.ethscriptions.com/address/0x3300000000000000000000000000000000000001) on the AppChain already indexes 6M+ ethscriptions with ownership data. We just call it.

```
"snepsid"
  → sha256("data:,snepsid")                      // content SHA
  → firstEthscriptionByContentUri(contentSha)     // ethscription ID
  → ownerOf(ethscriptionId)                       // owner address
  → 0x4212D149F77308a87ce9928F1095eDdb894f4D68
```

All view calls. Free. No gas. Trustless.

## Contract

`contracts/src/ChainHostResolver.sol` — thin wrapper around the Ethscriptions contract:

```solidity
IEthscriptions constant ETHSCRIPTIONS =
    IEthscriptions(0x3300000000000000000000000000000000000001);

function resolve(string calldata name) external view returns (address) {
    bytes32 sha = sha256(abi.encodePacked("data:,", name));
    bytes32 id = ETHSCRIPTIONS.firstEthscriptionByContentUri(sha);
    if (id == bytes32(0)) return address(0);
    return ETHSCRIPTIONS.ownerOf(id);
}
```

### Functions

| Function | Description |
|----------|-------------|
| `resolve(string)` | Name → owner address |
| `exists(string)` | Is the name inscribed? |
| `ethscriptionId(string)` | Name → ethscription ID |
| `contentSha(string)` | Name → content SHA |

### Build

```bash
cd contracts && forge build
```

### Deploy to AppChain

```bash
forge create contracts/src/ChainHostResolver.sol:ChainHostResolver \
  --rpc-url https://mainnet.ethscriptions.com \
  --private-key $PRIVATE_KEY
```

## Key Addresses

| Contract | Address | Chain |
|----------|---------|-------|
| Ethscriptions (proxy) | `0x3300000000000000000000000000000000000001` | AppChain (61166) |
| Ethscriptions (impl) | `0xc0D3C0d3C0d3c0d3c0D3C0D3C0D3C0d3c0d30001` | AppChain (61166) |

## Direct RPC Usage (no deploy needed)

You don't even need the resolver contract. Call the Ethscriptions contract directly:

```js
const APPCHAIN_RPC = "https://mainnet.ethscriptions.com";
const ETHSCRIPTIONS = "0x3300000000000000000000000000000000000001";

// 1. Hash the name
const sha = sha256("data:,snepsid"); // use crypto.subtle or ethers

// 2. Get ethscription ID
const id = await contract.firstEthscriptionByContentUri(sha);

// 3. Get owner
const owner = await contract.ownerOf(id);
```

## AppChain RPC

- **RPC URL**: `https://mainnet.ethscriptions.com`
- **Chain ID**: `61166` (`0xeeee`)
- **Explorer**: `https://explorer.ethscriptions.com`
- **Rate limit**: Max 5 calls per JSON-RPC batch, rate limited on high traffic
