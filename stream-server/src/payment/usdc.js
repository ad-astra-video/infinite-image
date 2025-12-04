const { ethers } = require('ethers');
const crypto = require('crypto');
const { useFacilitator } = require('x402/verify');
const axios = require('axios');

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
      validAfter: now.toString(),
      validBefore: (now + 3600).toString(), // Valid for 1 hour
      nonce: generateBytes32Nonce(),
    },
  };
}

function createSweepTask({ depositAddress, depositPrivateKey, provider, sweepAddress, network = 'base-sepolia', facilitatorUrl, logger }) {
  if (!depositAddress || !depositPrivateKey || !sweepAddress) {
    if (logger && logger.error) logger.error('createSweepTask missing required params');
    return {
      startSweepTask: () => {
        if (logger && logger.info) logger.info('USDC sweep not started due to missing config');
      },
      sweepUsdc: async () => {}
    };
  }

  const USDC_CONTRACT_ADDRESS = USDC_CONTRACT_ADDRESSES[network] || USDC_CONTRACT_ADDRESSES['base-sepolia'];
  
  // Initialize facilitator client
  const facilitatorConfig = facilitatorUrl ? { url: facilitatorUrl } : undefined;
  const actualFacilitatorUrl = facilitatorUrl || 'https://x402.org/facilitator';
  logger.info(`Using facilitator: ${actualFacilitatorUrl}`);
  
  const { verify, settle, supported } = useFacilitator(facilitatorConfig);
  
  async function sweepUsdc() {
    try {
      const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
      const balance = await usdcContract.balanceOf(depositAddress);

      if (typeof balance === 'bigint') {
        if (balance < 10000n) { // .01 USDC (6 decimals)
          logger.info(`USDC balance below threshold (0.01 USDC), skipping sweep. Balance: ${balance}`);
          return;
        }
      }

      logger.info(`Starting USDC x402 Sweep with ${facilitatorUrl}`);
      
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
      
      // Verify the signature matches the deposit address
      if (wallet.address.toLowerCase() !== depositAddress.toLowerCase()) {
        logger.error(`WARNING: Signer address (${wallet.address}) does not match deposit address (${depositAddress})`);
      }

      // Prepare payment payload and requirements for x402
      const paymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: network,
        payload: {
          signature: signature,
          authorization: typedData.message
        }
      };

      // Payment requirements matching PayAI facilitator format
      const paymentRequirements = {
        scheme: "exact",
        network: network,
        maxAmountRequired: balance.toString(),
        resource: `https://sweep.usdc/${depositAddress}`,
        description: "Sweep USDC from ephemeral deposit address",
        mimeType: "application/json",
        payTo: sweepAddress,
        maxTimeoutSeconds: 60,
        asset: USDC_CONTRACT_ADDRESS,
        extra: {
          name: "USD Coin",
          version: "2"
        }
      };
      // Step 1: Verify the payment with facilitator
      let verifyResponse;
      try {
        // Make direct HTTP call to get full error details
        const verifyUrl = `${actualFacilitatorUrl}/verify`;
        
        const httpResponse = await axios.post(verifyUrl, {
          x402Version: paymentPayload.x402Version,
          paymentPayload: paymentPayload,
          paymentRequirements: paymentRequirements
        }, {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true // Don't throw on non-2xx status
        });        
       
        if (httpResponse.status !== 200) {
          throw new Error(`Facilitator returned ${httpResponse.status}: ${JSON.stringify(httpResponse.data)}`);
        }
        
        verifyResponse = httpResponse.data;
      } catch (verifyError) {
        logger.error(`Verify call failed: ${verifyError.message}`);
        logger.error(`Verify error stack: ${verifyError.stack}`);
        if (verifyError.response) {
          logger.error(`Axios error response: ${JSON.stringify(verifyError.response.data, null, 2)}`);
        }
        throw verifyError;
      }

      if (!verifyResponse.isValid) {
        logger.error(`USDC sweep verification failed!`);
        logger.error(`Error reason: ${verifyResponse.errorReason || 'Unknown error'}`);
        logger.error(`Full verify response: ${JSON.stringify(verifyResponse, null, 2)}`);
        return;
      }

      logger.info(`✓ USDC sweep verified successfully`);

      // Step 2: Settle the payment with facilitator
      let settleResponse;
      try {
        // Make direct HTTP call to get full error details
        const settleUrl = `${actualFacilitatorUrl}/settle`;
        
        const httpResponse = await axios.post(settleUrl, {
          paymentPayload: paymentPayload,
          paymentRequirements: paymentRequirements
        }, {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true // Don't throw on non-2xx status
        });
               
        if (httpResponse.status !== 200) {
          throw new Error(`Facilitator returned ${httpResponse.status}: ${JSON.stringify(httpResponse.data)}`);
        }
        
        settleResponse = httpResponse.data;
      } catch (settleError) {
        logger.error(`Settle call failed: ${settleError.message}`);
        logger.error(`Settle error stack: ${settleError.stack}`);
        if (settleError.response) {
          logger.error(`Axios error response: ${JSON.stringify(settleError.response.data, null, 2)}`);
        }
        throw settleError;
      }

      if (!settleResponse.success) {
        logger.error(`USDC sweep settlement failed!`);
        logger.error(`Error reason: ${settleResponse.errorReason || 'Unknown error'}`);
        logger.error(`Full settle response: ${JSON.stringify(settleResponse, null, 2)}`);
        return;
      }

      logger.info(`✓ USDC sweep settled successfully`);
      if (settleResponse.txHash) {
        logger.info(`✓ Sweep transaction hash: ${settleResponse.txHash}`);
      }
    } catch (error) {
      logger.error('=== USDC x402 Sweep Error ===');
      logger.error(`Error message: ${error.message}`);
      
      if (error.response) {
        logger.error(`HTTP Response Status: ${error.response.status}`);
        logger.error(`HTTP Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      if (error.cause) {
        logger.error(`Error cause: ${JSON.stringify(error.cause, null, 2)}`);
      }
      
      logger.error('=== End Error Details ===');
    }
  }

  function startSweepTask(intervalMs = 60000) {
    setInterval(sweepUsdc, intervalMs);
    logger.info('USDC sweep task started (x402 mode)');
  }

  return { startSweepTask, sweepUsdc };
}

module.exports = { createSweepTask };
