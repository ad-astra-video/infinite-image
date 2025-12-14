
// Generate a proper bytes32 nonce for EIP-712
function generateBytes32Nonce() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return '0x' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

const EVM_NETWORK_TO_CHAIN_ID = {
  "base-sepolia": 84532,
  "base": 8453,
  "avalanche-fuji": 43113,
  "avalanche": 43114,
}

export function buildX402TypedData(payReq, walletAddress) {

  const now = Math.floor(Date.now() / 1000)
  const chainId = EVM_NETWORK_TO_CHAIN_ID[payReq.network] || 84532 // fallback to base-sepolia
  return {
    domain: {
      name: payReq.extra?.name || "USD Coin",
      version: payReq.extra?.version || "2",
      chainId: chainId,
      verifyingContract: payReq.asset,
    },
    types: {
        TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
        ],
        EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" }
        ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
        from: walletAddress,
        to: payReq.payTo,
        value: payReq.maxAmountRequired,
        validAfter: (now-1).toString(), // Valid immediately
        validBefore: (now + 300).toString(), // Valid for 5 minutes
        nonce: generateBytes32Nonce(),
    },
  }
}