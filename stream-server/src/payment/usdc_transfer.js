const { ethers } = require('ethers');
const axios = require('axios');
const crypto = require('crypto');

// USDC Contract ABI (minimal subset used for balanceOf)
const USDC_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// USDC contract addresses for different networks
const USDC_CONTRACT_ADDRESSES = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x75f89a12e8f9d5a260a8c076e9e0c5d16ba679e"
};

// EVM network to chain ID mapping
const EVM_NETWORK_TO_CHAIN_ID = {
  "base-sepolia": 84532,
  "base": 8453,
  "avalanche-fuji": 43113,
  "avalanche": 43114,
};

// Generate a proper bytes32 nonce for EIP-712
function generateBytes32Nonce() {
  const array = crypto.randomBytes(32);
  return '0x' + array.toString('hex');
}

// Build EIP-712 typed data for TransferWithAuthorization
function buildX402TypedData(from, to, value, asset, network) {
  const now = Math.floor(Date.now() / 1000);
  const chainId = EVM_NETWORK_TO_CHAIN_ID[network] || 84532; // fallback to base-sepolia
  
  return {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: chainId,
      verifyingContract: asset,
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
      from: from,
      to: to,
      value: value.toString(),
      validAfter: "0",
      validBefore: (now + 3600).toString(), // Valid for 1 hour
      nonce: generateBytes32Nonce(),
    },
  };
}

function createSweepTask({ depositAddress, depositPrivateKey, provider, sweepAddress, network = 'base-sepolia', facilitatorUrl, logger }) {
  if (!depositAddress || !depositPrivateKey || !sweepAddress || !facilitatorUrl) {
    if (logger && logger.error) logger.error('createSweepTask missing required params');
    return {
      startSweepTask: () => {
        if (logger && logger.info) logger.info('USDC sweep not started due to missing config');
      },
      sweepUsdc: async () => {}
    };
  }

  const USDC_CONTRACT_ADDRESS = USDC_CONTRACT_ADDRESSES[network] || USDC_CONTRACT_ADDRESSES['base-sepolia'];

  async function sweepUsdc() {
    try {
      const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
      const balance = await usdcContract.balanceOf(depositAddress);

      if (typeof balance === 'bigint') {
        if (balance <= 1000000n) { // 1 USDC (6 decimals)
          logger.info(`USDC balance below threshold, skipping sweep. Balance: ${balance}`);
          return;
        }
      }

      // Build EIP-712 typed data for x402 transfer
      const typedData = buildX402TypedData(
        depositAddress,
        sweepAddress,
        balance,
        USDC_CONTRACT_ADDRESS,
        network
      );

      // Sign the typed data
      const wallet = new ethers.Wallet(depositPrivateKey);
      const signature = await wallet.signTypedData(
        typedData.domain,
        { TransferWithAuthorization: typedData.types.TransferWithAuthorization },
        typedData.message
      );

      // Submit to facilitator for execution
      const response = await axios.post(`${facilitatorUrl}/submit`, {
        typedData,
        signature,
        from: depositAddress,
        network: network
      });

      logger.info(`USDC sweep submitted via x402: ${JSON.stringify(response.data)}`);
      
      if (response.data.txHash) {
        logger.info(`Sweep transaction hash: ${response.data.txHash}`);
      }
    } catch (error) {
      logger.error(`USDC sweep failed: ${error.message}`);
      if (error.response) {
        logger.error(`Facilitator response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  function startSweepTask(intervalMs = 60000) {
    setInterval(sweepUsdc, intervalMs);
    logger.info('USDC sweep task started (x402 mode)');
  }

  return { startSweepTask, sweepUsdc };
}

module.exports = { createSweepTask };
