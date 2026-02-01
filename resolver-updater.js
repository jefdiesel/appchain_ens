/**
 * ChainHost Resolver Updater Bot
 *
 * Polls the ethscriptions indexer API for ownership changes on tracked names
 * and pushes updates to the ChainHostResolver contract on the AppChain.
 *
 * Usage:
 *   PRIVATE_KEY=0x... RESOLVER_ADDRESS=0x... node scripts/resolver-updater.js
 *
 * Optional env:
 *   APPCHAIN_RPC    - AppChain RPC URL (default: http://localhost:8545)
 *   POLL_INTERVAL   - seconds between polls (default: 30)
 *   NAMES_FILE      - path to JSON array of names to track (default: scripts/tracked-names.json)
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ============ Config ============

const APPCHAIN_RPC = process.env.APPCHAIN_RPC || "http://localhost:8545";
const RESOLVER_ADDRESS = process.env.RESOLVER_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "30", 10) * 1000;
const NAMES_FILE = process.env.NAMES_FILE || path.join(__dirname, "tracked-names.json");
const ETHSCRIPTIONS_API = "https://api.ethscriptions.com/v2/ethscriptions/exists";
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY = 2000;
const BATCH_SIZE = 5; // AppChain RPC max batch size

if (!RESOLVER_ADDRESS || !PRIVATE_KEY) {
  console.error("Missing RESOLVER_ADDRESS or PRIVATE_KEY");
  process.exit(1);
}

// ============ ABI (only what we need) ============

const RESOLVER_ABI = [
  "function resolve(string calldata name) external view returns (address)",
  "function update(string calldata name, address owner) external",
  "function updateBatch(string[] calldata _names, address[] calldata _owners) external",
];

// ============ Setup ============

const provider = new ethers.JsonRpcProvider(APPCHAIN_RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const resolver = new ethers.Contract(RESOLVER_ADDRESS, RESOLVER_ABI, wallet);

// ============ Helpers ============

function ethscriptionId(name) {
  const content = `data:,${name}`;
  return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

async function fetchOwner(name) {
  const id = ethscriptionId(name);
  const url = `${ETHSCRIPTIONS_API}/${id}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.result?.exists) {
      return data.result.ethscription.current_owner.toLowerCase();
    }
    return null;
  } catch (err) {
    console.error(`  [!] API error for "${name}":`, err.message);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rpcWithRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err?.message?.includes("429") || err?.message?.includes("rate");
      if (!isRateLimit || attempt === MAX_RETRIES) throw err;
      const delay = INITIAL_RETRY_DELAY * 2 ** attempt;
      console.error(`  [!] Rate limited on ${label}, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

function loadTrackedNames() {
  if (!fs.existsSync(NAMES_FILE)) {
    console.error(`Names file not found: ${NAMES_FILE}`);
    console.error(`Create it with a JSON array of names, e.g.: ["snepsid", "chainhost"]`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(NAMES_FILE, "utf-8"));
}

// ============ Main Loop ============

async function poll() {
  const names = loadTrackedNames();
  console.log(`\n[${new Date().toISOString()}] Checking ${names.length} names...`);

  const toUpdate = { names: [], owners: [] };

  // Process names in batches to respect RPC rate limits
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    if (i > 0) await sleep(50); // small delay between batches

    await Promise.all(batch.map(async (name) => {
      const indexerOwner = await fetchOwner(name);
      if (!indexerOwner) return;

      let contractOwner;
      try {
        contractOwner = await rpcWithRetry(
          () => resolver.resolve(name).then((a) => a.toLowerCase()),
          `resolve("${name}")`
        );
      } catch {
        contractOwner = ethers.ZeroAddress;
      }

      if (contractOwner !== indexerOwner) {
        console.log(`  [~] "${name}": ${contractOwner.slice(0, 10)}... → ${indexerOwner.slice(0, 10)}...`);
        toUpdate.names.push(name);
        toUpdate.owners.push(indexerOwner);
      }
    }));
  }

  if (toUpdate.names.length === 0) {
    console.log("  [ok] All names up to date.");
    return;
  }

  console.log(`  [tx] Updating ${toUpdate.names.length} name(s)...`);
  try {
    let tx;
    if (toUpdate.names.length === 1) {
      tx = await resolver.update(toUpdate.names[0], toUpdate.owners[0]);
    } else {
      tx = await resolver.updateBatch(toUpdate.names, toUpdate.owners);
    }
    console.log(`  [tx] Sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  [ok] Confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    console.error(`  [!] TX failed:`, err.message);
  }
}

async function main() {
  console.log("ChainHost Resolver Updater");
  console.log(`  Contract: ${RESOLVER_ADDRESS}`);
  console.log(`  RPC:      ${APPCHAIN_RPC}`);
  console.log(`  Interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`  Names:    ${NAMES_FILE}`);

  // Run immediately, then on interval
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
