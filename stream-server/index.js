const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Web3 } = require('web3');
const { ethers } = require('ethers');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const app = express();
const PORT = 4021;

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
  origin: ["http://localhost:3000"],
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

// Logging
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Get configuration from environment
const MUXION_API_KEY = process.env.MUXION_GATEWAY_API_KEY;
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

// Global state
let streamRunning = false;
let streamId = null;
let streamUrls = {};
let streamControlIds = {};
let nextControlStart = 0;
let tipMsgs = [];

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

class TipRequest {
  constructor(data) {
    this.msg = data.msg;
  }
}

// Load or create Ethereum wallet
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

// USDC Contract ABI
const USDC_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "value", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// USDC contract address on Base
const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Background task: sweep USDC from DEPOSIT_ADDRESS to SWEEP_ADDRESS every minute
async function sweepUsdc() {
  try {
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
    const balance = await usdcContract.balanceOf(depositAddress);
    
    if (balance <= 1000000n) { // 1 USDC (6 decimals)
      logger.info(`USDC balance below threshold, skipping sweep. Balance: ${balance}`);
      return;
    }
    
    // Create wallet instance for signing
    const wallet = new ethers.Wallet(depositPrivateKey, provider);
    
    // Build and send a signed ERC-20 transfer transaction
    const tx = await usdcContract.connect(wallet).transfer(
      SWEEP_ADDRESS,
      balance
    );
    
    logger.info(`Sent USDC transfer tx ${tx.hash}`);
  } catch (error) {
    logger.error(`USDC sweep failed: ${error.message}`);
  }
}

// Start background sweep task
function startSweepTask() {
  setInterval(sweepUsdc, 60000); // 1 minute
  logger.info("USDC sweep task started");
}

// Payment middleware simulation (x402 equivalent)
function requirePayment(options) {
  return async (req, res, next) => {
    try {
      // In a real implementation, this would verify payment with x402
      logger.info(`Payment required for ${options.path}, amount: ${options.price}`);
      // For now, we'll just log and continue
      next();
    } catch (error) {
      logger.error(`Payment verification failed: ${error.message}`);
      res.status(402).json({ error: "Payment required" });
    }
  };
}

// Apply payment middleware to specific routes
app.use('/api/tip/1', requirePayment({
  path: "/api/tip/1",
  price: "$0.01",
  pay_to_address: depositAddress,
  network: "base"
}));

app.use('/api/tip/5', requirePayment({
  path: "/api/tip/5",
  price: "$0.05",
  pay_to_address: depositAddress,
  network: "base"
}));

app.use('/api/tip/10', requirePayment({
  path: "/api/tip/10",
  price: "$0.10",
  pay_to_address: depositAddress,
  network: "base"
}));

app.use('/api/stream/director/1', requirePayment({
  path: "/api/stream/director/1",
  price: "$1.00",
  pay_to_address: depositAddress,
  network: "base"
}));

app.use('/api/stream/director/5', requirePayment({
  path: "/api/stream/director/5",
  price: "$5.00",
  pay_to_address: depositAddress,
  network: "base"
}));

app.use('/api/stream/director/10', requirePayment({
  path: "/api/stream/director/10",
  price: "$10.00",
  pay_to_address: depositAddress,
  network: "base"
}));

// Stream management functions
async function startStream(req = null) {
  try {
    const startReq = JSON.parse(fs.readFileSync("start_request.json", 'utf8'));
    const livepeerHdr = startReq.header;
    livepeerHdr.request = JSON.stringify(startReq.request);
    livepeerHdr.parameters = JSON.stringify(startReq.parameters);

    const startResp = await axios.post(
      `${GATEWAY_URL}/ai/stream/start`,
      startReq.stream_request,
      {
        headers: {
          "Livepeer": Buffer.from(JSON.stringify(livepeerHdr)).toString("base64"),
          "Authorization": `Bearer ${MUXION_API_KEY}`
        }
      }
    );

    if (startResp.status !== 200) {
      logger.error(`Failed to start stream: ${startResp.status} ${startResp.data}`);
      throw new Error("Failed to start stream");
    }

    streamUrls = startResp.data;
    streamId = streamUrls.stream_id;
    streamRunning = true;
    logger.info("Stream started");
    
    return {
      stream: {
        status: "running"
      }
    };
  } catch (error) {
    logger.error(`Start stream failed: ${error.message}`);
    throw error;
  }
}

async function updateStream(req) {
  if (!req.controlId) {
    throw new Error("Missing control_id for stream update");
  }

  const controlIdData = streamControlIds[req.controlId];
  if (!controlIdData) {
    throw new Error("Invalid control_id for stream update");
  }

  const now = new Date();
  if (now < controlIdData.start || now > controlIdData.expiresAt) {
    throw new Error(`control_id has expired or not yet active, start_utc: ${controlIdData.start.toISOString()}, expires_at_utc: ${controlIdData.expiresAt.toISOString()}`);
  }

  try {
    const updateResp = await axios.post(
      `${GATEWAY_URL}/ai/stream/${streamId}/update`,
      { params: req },
      { headers: { "Authorization": `Bearer ${MUXION_API_KEY}` } }
    );

    if (updateResp.status !== 200) {
      logger.error(`Failed to update stream: ${updateResp.status} ${updateResp.data}`);
      throw new Error("Failed to update stream");
    }

    logger.info(`Stream updated for control_id: ${req.controlId}`);
    return {
      stream: {
        status: "updated"
      }
    };
  } catch (error) {
    logger.error(`Update stream failed: ${error.message}`);
    throw error;
  }
}

function setupStreamControl(req, controlMinutes) {
  const controlId = uuidv4().replace(/-/g, '');
  let nextStart = nextControlStart;
  
  if (nextStart === 0 || nextStart < new Date()) {
    nextStart = new Date();
    nextControlStart = new Date(nextStart.getTime() + controlMinutes * 60000);
  }

  streamControlIds[controlId] = {
    start: nextStart,
    expiresAt: nextControlStart,
    params: req
  };

  return [controlId, nextControlStart];
}

// Routes

// Stream director endpoints
app.post('/api/stream/director/1', async (req, res) => {
  try {
    if (!streamRunning) {
      await startStream(req.body);
    } else {
      const [controlId, expiresAt] = setupStreamControl(req.body, 1);
      req.body.controlId = controlId;
      await updateStream(req.body);
    }
    
    res.json({
      deposit: {
        amount_usd: 1,
        control_id: req.body.controlId,
        expires_at_utc: nextControlStart.toISOString()
      }
    });
  } catch (error) {
    logger.error(`Stream director 1 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stream/director/5', async (req, res) => {
  try {
    if (!streamRunning) {
      await startStream(req.body);
    } else {
      const [controlId, expiresAt] = setupStreamControl(req.body, 5);
      req.body.controlId = controlId;
      await updateStream(req.body);
    }
    
    res.json({
      deposit: {
        amount_usd: 5,
        control_id: req.body.controlId,
        expires_at_utc: nextControlStart.toISOString()
      }
    });
  } catch (error) {
    logger.error(`Stream director 5 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stream/director/10', async (req, res) => {
  try {
    if (!streamRunning) {
      await startStream(req.body);
    } else {
      const [controlId, expiresAt] = setupStreamControl(req.body, 10);
      req.body.controlId = controlId;
      await updateStream(req.body);
    }
    
    res.json({
      deposit: {
        amount_usd: 10,
        control_id: req.body.controlId,
        expires_at_utc: nextControlStart.toISOString()
      }
    });
  } catch (error) {
    logger.error(`Stream director 10 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stream/director/update', async (req, res) => {
  try {
    if (!streamRunning) {
      return res.status(400).json({ error: "Stream is not running" });
    }
    
    if (!req.body.controlId) {
      return res.status(400).json({ error: "Missing control_id for stream update" });
    }
    
    await updateStream(req.body);
    res.json({
      stream: {
        status: "updated"
      }
    });
  } catch (error) {
    logger.error(`Stream director update failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Tip endpoints
app.post('/api/tip/1', (req, res) => {
  try {
    const tipRequest = new TipRequest(req.body);
    tipMsgs.push({ msg: tipRequest.msg, level: 1, ts: Date.now() / 1000 });
    res.json({
      tip: {
        amount_usd: 0.01
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
    res.json({
      tip: {
        amount_usd: 0.05
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
    res.json({
      tip: {
        amount_usd: 0.1
      }
    });
  } catch (error) {
    logger.error(`Tip 10 failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Super chat functionality
const SUPER_CHAT_EXPIRY = {
  1: 5,
  5: 15,
  10: 25
};

function pruneAndGetActiveChats() {
  const now = Date.now() / 1000;
  const active = [];
  const newTipMsgs = [];

  for (const t of tipMsgs) {
    const level = t.level || 1;
    const ts = t.ts || now;
    const expiry = SUPER_CHAT_EXPIRY[level] || 5;
    const remaining = expiry - (now - ts);
    
    if (remaining > 0) {
      const remainingSeconds = Math.max(0, Math.floor(remaining));
      active.push({
        msg: t.msg,
        level: level,
        remaining_seconds: remainingSeconds,
        ts: ts
      });
      newTipMsgs.push({
        msg: t.msg,
        level: level,
        ts: ts
      });
    }
  }

  tipMsgs = newTipMsgs;
  logger.info(`Active super chats: ${JSON.stringify(active)}`);
  
  // Sort by level desc, then by timestamp desc
  active.sort((a, b) => (-a.level, -b.ts));
  return active;
}

app.get('/api/super/chat', (req, res) => {
  try {
    const active = pruneAndGetActiveChats();
    res.json({ super_chats: active });
  } catch (error) {
    logger.error(`Get super chat failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Payment confirmation endpoint
app.post('/api/stream/payment/sent', (req, res) => {
  res.json({
    payment: {
      status: "received"
    }
  });
});

// Stream URL endpoint
app.get('/stream/url', (req, res) => {
  if (!streamRunning) {
    return res.json({
      stream: {
        status: "not_running",
        whep_url: null
      }
    });
  }

  let whepUrl = streamUrls.whep_url;
  if (!whepUrl && streamUrls.stream_id) {
    whepUrl = `${GATEWAY_URL.replace('gateway', 'stream')}/whep/${streamUrls.stream_id}`;
  }

  res.json({
    stream: {
      status: "running",
      whep_url: whepUrl,
      stream_id: streamUrls.stream_id,
      playback_url: streamUrls.playback_url
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Static file serving
app.use('/assets', express.static(path.join(__dirname, '../frontend/dist/assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  startSweepTask();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;