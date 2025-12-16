const express = require('express');
const { paymentMiddleware } = require('x402-express');

class TipRouter {
  constructor({ logger, depositAddress, facilitatorUrl, network, usdcAddress, chatRouter }) {
    this.logger = logger;
    this.depositAddress = depositAddress;
    this.facilitatorUrl = facilitatorUrl;
    this.network = network;
    this.usdcAddress = usdcAddress;
    this.chatRouter = chatRouter;
    this.router = express.Router();

    // Local state
    this.tipMsgs = [];

    // Setup payment middleware for tip endpoints with timeout handling
    this.router.use(paymentMiddleware(
      this.depositAddress,
      {
        "/api/tip/1": {
          price: "$0.01",
          network: this.network,
          config: {
            description: "Tip $0.01 USDC for level 1 supporter chat",
            asset: {
              address: this.usdcAddress,
              decimals: 6,
              eip712: { name: "USD Coin", version: "2" }
            }
          }
        },
        "/api/tip/5": {
          price: "$0.05",
          network: this.network,
          config: {
            description: "Tip $0.05 USDC for level 5 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/10": {
          price: "$0.10",
          network: this.network,
          config: {
            description: "Tip $0.10 USDC for level 10 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/25": {
          price: "$0.25",
          network: this.network,
          config: {
            description: "Tip $0.25 USDC for level 25 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/100": {
          price: "$1.00",
          network: this.network,
          config: {
            description: "Tip $1.00 USDC for level 100 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/500": {
          price: "$5.00",
          network: this.network,
          config: {
            description: "Tip $5.00 USDC for level 500 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/1000": {
          price: "$10.00",
          network: this.network,
          config: {
            description: "Tip $10.00 USDC for level 1000 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        },
        "/api/tip/2500": {
          price: "$25.00",
          network: this.network,
          config: {
            description: "Tip $25.00 USDC for level 2500 supporter chat",
            asset: { address: this.usdcAddress, decimals: 6, eip712: { name: "USD Coin", version: "2" } }
          }
        }
      },
      {
        url: this.facilitatorUrl,
        timeout: 10000 // 10 second timeout
      }
    ));

    // Tip request validation class
    class TipRequest {
      constructor(data = {}) {
        this.msg = data.msg ?? '';
        this.userAddress = data.userAddress ?? '';
        this.userSignature = data.userSignature ?? '';
      }
    }

    // Define tip routes with proper error handling
    this.router.post('/api/tip/1', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 1, ts: Date.now() / 1000 });
        if (tipRequest.userAddress) {
          this.chatRouter.addSupporterUser(tipRequest.userAddress, 1);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '0.01');
        
        res.json({ tip: { amount_usd: 0.01, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 1 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/5', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 5, ts: Date.now() / 1000 });
        if (req.body.userAddress) {
          this.chatRouter.addSupporterUser(req.body.userAddress, 5);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '0.05');
        
        res.json({ tip: { amount_usd: 0.05, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 5 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/10', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 10, ts: Date.now() / 1000 });
        if (req.body.userAddress) {
          this.chatRouter.addSupporterUser(req.body.userAddress, 10);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '0.10');
        
        res.json({ tip: { amount_usd: 0.1, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 10 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/25', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 25, ts: Date.now() / 1000 });
        if (req.body.userAddress) {
          this.chatRouter.addSupporterUser(req.body.userAddress, 25);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '0.25');
        
        res.json({ tip: { amount_usd: 0.25, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 25 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/100', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 100, ts: Date.now() / 1000 });
        if (tipRequest.userAddress) {
          this.chatRouter.addSupporterUser(tipRequest.userAddress, 100);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '1.00');
        
        res.json({ tip: { amount_usd: 1.00, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 100 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/500', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 500, ts: Date.now() / 1000 });
        if (tipRequest.userAddress) {
          this.chatRouter.addSupporterUser(tipRequest.userAddress, 500);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '5.00');
        
        res.json({ tip: { amount_usd: 5.00, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 500 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/1000', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 1000, ts: Date.now() / 1000 });
        if (tipRequest.userAddress) {
          this.chatRouter.addSupporterUser(tipRequest.userAddress, 1000);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '10.00');
        
        res.json({ tip: { amount_usd: 10.00, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 1000 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });

    this.router.post('/api/tip/2500', async (req, res) => {
      try {
        const tipRequest = new TipRequest(req.body);
        this.tipMsgs.push({ msg: tipRequest.msg, level: 2500, ts: Date.now() / 1000 });
        if (tipRequest.userAddress) {
          this.chatRouter.addSupporterUser(tipRequest.userAddress, 2500);
        }
        
        // Create and broadcast tip message using helper function
        const userAddress = tipRequest.userAddress || 'anonymous';
        this.chatRouter.sendTipMessage('public', userAddress, tipRequest.msg, 'tip', '25.00');
        
        res.json({ tip: { amount_usd: 25.00, status: 'success' } });
      } catch (error) {
        this.logger.error(`Tip 2500 failed: ${error.message}`);
        if (!res.headersSent) {
          // Handle timeout errors specifically
          if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            res.status(408).json({ error: 'Facilitator timed out verifying transaction, please try again shortly.' });
          } else {
            res.status(500).json({ error: error.message });
          }
        }
      }
    });
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { TipRouter };
