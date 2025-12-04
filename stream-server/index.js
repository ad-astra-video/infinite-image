// Load environment variables first
const dotenv = require('dotenv');
dotenv.config();

// Import all required modules
const express = require('express');
const cors = require('cors');
const { Web3 } = require('web3');
const { ethers } = require('ethers');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Create logger first
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Get configuration from environment
const APP_NAME = process.env.APP_NAME || 'X402-Gateway';
const GATEWAY_API_KEY= process.env.GATEWAY_API_KEY;
const GATEWAY_URL = process.env.GATEWAY_URL || "https://gateway.muxion.video";
const FACILITATOR_URL = process.env.FACILITATOR_URL;
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const SWEEP_ADDRESS = process.env.SWEEP_ADDRESS;

if (!BASE_RPC_URL) {
  throw new Error("Missing BASE_RPC_URL environment variable");
}

const w3 = new Web3(BASE_RPC_URL);
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const WALLET_FILE = "/wallet/eth_wallet.json";
// USDC payment utilities
const { createSweepTask } = require('./src/payment/usdc');

// Load or create Ethereum wallet first
let depositAddress, depositPrivateKey;
try {
  if (fs.existsSync(WALLET_FILE)) {
    const wallet = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    depositAddress = wallet.address;
    depositPrivateKey = wallet.private_key;
    logger.info(`opened wallet for deposits: ${depositAddress}`);
  } else {
    const wallet = ethers.Wallet.createRandom();
    depositAddress = wallet.address;
    depositPrivateKey = wallet.privateKey;
    logger.info(`created in-memory wallet for deposits: ${depositAddress}`);
  }
} catch (error) {
  logger.error(`Wallet loading/creation failed: ${error.message}`);
  throw error;
}

if (!depositAddress || !FACILITATOR_URL || !SWEEP_ADDRESS) {
  throw new Error("Missing required environment variables (DEPOSIT_ADDRESS, FACILITATOR_URL, SWEEP_ADDRESS)");
}

const { paymentMiddleware } = require('x402-express');
const { StreamRouter } = require('./src/routes/streamRoutes');
const { DirectorRouter } = require('./src/routes/directorRoutes');
const { ChatRouter } = require('./src/routes/chatRoutes');

// Create chat router first for socket.io chat functionality
const chatRouter = new ChatRouter({
  logger,
});

// Create route instances
const streamRouter = new StreamRouter({
  logger,
  depositAddress,
  depositPrivateKey,
  facilitatorUrl: FACILITATOR_URL,
  network: process.env.NETWORK || "base-sepolia"
});

// Create director router for director access and payment functionality
const directorRouter = new DirectorRouter({
  logger,
  depositAddress,
  depositPrivateKey,
  facilitatorUrl: FACILITATOR_URL,
  network: process.env.NETWORK || "base-sepolia"
});

// Create the app and mount routes
const app = express();
const PORT = 4021;

// USDC contract addresses for different networks
const NETWORK = process.env.NETWORK || "base-sepolia";
const usdcAddresses = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  "base-sepolia": "0x75f89a12e8f9d5a260a8c076e9e0c5d16ba679e" // Base Sepolia testnet
};
const usdcAddress = usdcAddresses[NETWORK] || usdcAddresses["base-sepolia"];

// Configure x402 payment middleware for tip endpoints
app.use(paymentMiddleware(
    depositAddress,
    {
      "/api/tip/1": {
        price: "$0.01",
        network: NETWORK,
        config: {
          description: "Tip $0.01 USDC for level 1 super chat",
          asset: {
            address: usdcAddress,
            decimals: 6,
            eip712: {
              name: "USD Coin",
              version: "2"
            }
          }
        }
      },
      "/api/tip/5": {
        price: "$0.05",
        network: NETWORK,
        config: {
          description: "Tip $0.05 USDC for level 5 super chat",
          asset: {
            address: usdcAddress,
            decimals: 6,
            eip712: {
              name: "USD Coin",
              version: "2"
            }
          }
        }
      },
      "/api/tip/10": {
        price: "$0.10",
        network: NETWORK,
        config: {
          description: "Tip $0.10 USDC for level 10 super chat",
          asset: {
            address: usdcAddress,
            decimals: 6,
            eip712: {
              name: "USD Coin",
              version: "2"
            }
          }
        }
      },
      "/api/tip/25": {
        price: "$0.25",
        network: NETWORK,
        config: {
          description: "Tip $0.25 USDC for level 25 super chat",
          asset: {
            address: usdcAddress,
            decimals: 6,
            eip712: {
              name: "USD Coin",
              version: "2"
            }
          }
        }
      }
    },
    {
      url: FACILITATOR_URL
    }
  )
);

// Mount routes to the app
app.use('/api/chat', chatRouter.getRouter());
app.use('/api/stream', streamRouter.getRouter());
app.use('/api/director', directorRouter.getRouter());

logger.info('Routes mounted: /api/chat, /api/messages, /api/stream, /api/tip, /api/director');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://mainnet.base.org", "https://explorer-api.walletconnect.com", "wss://relay.walletconnect.com", "wss://relay.walletconnect.org"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://verify.walletconnect.com", "https://verify.walletconnect.org"],
    },
  },
}));
app.use(cors({
  origin: ["*"],
  credentials: false,
  methods: ["*"],
  allowedHeaders: ["*"]
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// Serve frontend static files from ../frontend/dist at root "/"
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // Serve index.html for root and for SPA client-side routes (ignore /api/*)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  logger.info(`Serving frontend static files from ${frontendDist}`);
} else {
  logger.info(`Frontend dist not found at ${frontendDist}; root route not served`);
}

// Global state - tipMsgs still needed for tip functionality
let tipMsgs = [];

// Tip request validation class
class TipRequest {
  constructor(data = {}) {
    this.msg = data.msg ?? ''; // default to empty string
    this.userAddress = data.userAddress ?? '';
    this.userSignature = data.userSignature ?? '';
  }
}

app.post('/api/tip/1', (req, res) => {
  try {
    const tipRequest = new TipRequest(req.body);
    tipMsgs.push({ msg: tipRequest.msg, level: 1, ts: Date.now() / 1000 });
    
    // Add user to supporter chat if available
    if (tipRequest.userAddress) {
      chatRouter.addSupporterUser(tipRequest.userAddress, tipRequest.userSignature, 0.01);
    }
    
    res.json({
      tip: {
        amount_usd: 0.01,
        status: "success"
      }
    });
  } catch (error) {
    logger.error(`Tip 1 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tip/5', (req, res) => {
  try {
    const tipRequest = new TipRequest(req.body);
    tipMsgs.push({ msg: tipRequest.msg, level: 5, ts: Date.now() / 1000 });
    
    // Add user to supporter chat if available
    if (req.body.userAddress) {
      chatRouter.addSupporterUser(req.body.userAddress, 0.05);
    }
    
    res.json({
      tip: {
        amount_usd: 0.05,
        status: "success"
      }
    });
  } catch (error) {
    logger.error(`Tip 5 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tip/10', (req, res) => {
  try {
    const tipRequest = new TipRequest(req.body);
    tipMsgs.push({ msg: tipRequest.msg, level: 10, ts: Date.now() / 1000 });
    
    // Add user to supporter chat if available
    if (req.body.userAddress) {
      chatRouter.addSupporterUser(req.body.userAddress, 0.1);
    }
    
    res.json({
      tip: {
        amount_usd: 0.1,
        status: "success"
      }
    });
  } catch (error) {
    logger.error(`Tip 10 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tip/25', (req, res) => {
  try {
    const tipRequest = new TipRequest(req.body);
    tipMsgs.push({ msg: tipRequest.msg, level: 25, ts: Date.now() / 1000 });
    
    // Add user to supporter chat if available
    if (req.body.userAddress) {
      chatRouter.addSupporterUser(req.body.userAddress, 0.25);
    }
    
    res.json({
      tip: {
        amount_usd: 0.25,
        status: "success"
      }
    });
  } catch (error) {
    logger.error(`Tip 25 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Models (equivalent to Pydantic models)
class PromptRequest {
  constructor(data) {
    this.prompt = data.prompt;
    this.seed = data.seed || 42;
    this.steps = data.steps || 28;
    this.guidanceScale = data.guidance_scale || 4.0;
    this.referenceImages = data.reference_images || null;
    this.controlId = data.control_id || null;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// App name endpoint
app.get('/api/name', (req, res) => {
  res.json({ name: APP_NAME });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

const http = require('http');
const server = http.createServer(app);

// Initialize WebSocket server with chat router
chatRouter.initializeWebSocketServer(server);

// Create USDC sweep task
const usdcSweep = createSweepTask({
  depositAddress,
  depositPrivateKey,
  provider,
  sweepAddress: SWEEP_ADDRESS,
  network: NETWORK,
  facilitatorUrl: FACILITATOR_URL,
  logger
});

server.listen(PORT, () => {
  logger.info(`Stream server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Base RPC URL: ${BASE_RPC_URL}`);
  logger.info(`Facilitator URL: ${FACILITATOR_URL}`);
  logger.info(`Sweep Address: ${SWEEP_ADDRESS}`);
  
  // Start background sweep task
  usdcSweep.startSweepTask();
  
  logger.info("x402-gateway stream server initialized successfully");
});

// Graceful shutdown handler - perform final USDC sweep on server close
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, performing final USDC sweep...`);
  
  try {
    await usdcSweep.sweepUsdc();
    logger.info('Final USDC sweep completed');
  } catch (error) {
    logger.error(`Final sweep failed: ${error.message}`);
  }
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app };
