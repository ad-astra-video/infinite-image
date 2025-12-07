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
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Get configuration from environment
const APP_NAME = process.env.APP_NAME || 'X402-Stream';
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

const { StreamRouter } = require('./src/routes/streamRoutes');
const { ChatRouter } = require('./src/routes/chatRoutes');
const { EnhancedAuthRoutes } = require('./src/routes/enhancedAuthRoutes');
const { TipRouter } = require('./src/routes/tipRoutes');

// Import new enhanced authentication system
const { sessionMiddleware } = require('./src/auth/ironSessionConfig');
const ChatMessageValidator = require('./src/auth/chatMessageValidator');

// Create enhanced auth router
const authRouter = new EnhancedAuthRoutes({
  logger,
});

// Create chat message validator with siweHandler reference
const messageValidator = new ChatMessageValidator({
  logger,
  sessionCache: authRouter.getSessionCache(),
  siweHandler: authRouter.siweHandler,
});

// Create chat router with enhanced validation and siweHandler
const chatRouter = new ChatRouter({
  logger,
  messageValidator,
  siweHandler: authRouter.siweHandler,
});

// Create route instances
const streamRouter = new StreamRouter({
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

// Middleware - MUST be before routes
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
  credentials: true, // Enable credentials for iron-session
  methods: ["*"],
  allowedHeaders: ["*"]
}));
app.use(express.json());

// Apply iron-session middleware for all routes
app.use(sessionMiddleware);


// Mount tip router (contains payment middleware and tip endpoints)
const tipRouter = new TipRouter({
  logger,
  depositAddress,
  depositPrivateKey,
  facilitatorUrl: FACILITATOR_URL,
  network: NETWORK,
  usdcAddress,
  chatRouter
});
app.use('/', tipRouter.getRouter());

// Mount routes to the app
app.use('/api/auth', authRouter.getRouter());
app.use('/api/chat', chatRouter.getRouter());
app.use('/api/stream', streamRouter.getRouter());

logger.info('Routes mounted: /api/auth, /api/chat, /api/messages, /api/stream, /api/tip');

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

// Tip endpoints (payment middleware moved to `./src/routes/tipRoutes.js`)

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
  
  logger.info("x402-Stream stream server initialized successfully");
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
