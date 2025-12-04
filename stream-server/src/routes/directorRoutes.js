const express = require('express');
const { paymentMiddleware } = require('x402-express');

class DirectorRouter {
  constructor(config, xmtpHandler = null) {
    this.logger = config.logger;
    this.depositAddress = config.depositAddress;
    this.depositPrivateKey = config.depositPrivateKey;
    this.facilitatorUrl = config.facilitatorUrl;
    this.network = config.network || "base-sepolia";
    this.xmtpHandler = xmtpHandler; // Optional XMTP handler for director chat
    this.router = express.Router();
    
    // USDC contract addresses for different networks
    this.usdcAddresses = {
      "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
      "base-sepolia": "0x75f89a12e8f9d5a260a8c076e9e0c5d16ba679e" // Base Sepolia testnet
    };
    
    this.setupRoutes();
  }

  setupRoutes() {
    // Configure x402 payment middleware for director endpoints
    const usdcAddress = this.usdcAddresses[this.network] || this.usdcAddresses["base-sepolia"];
    
    this.router.use(paymentMiddleware(
      this.depositAddress,
      {
        "/director/1": {
          price: "$1.00",
          network: this.network,
          config: {
            description: "Director access for $1.00 USDC - Level 1",
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
        "/director/5": {
          price: "$5.00",
          network: this.network,
          config: {
            description: "Director access for $5.00 USDC - Level 5",
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
        "/director/10": {
          price: "$10.00",
          network: this.network,
          config: {
            description: "Director access for $10.00 USDC - Level 10",
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
      }
    ));

    // Director access endpoints with different levels
    this.router.post('/director/1', async (req, res) => {
      try {
        // Payment verification successful - director access granted
        this.logger.info(`Director 1 access granted for ${req.body.controlId || 'default_user'}`);
        
        res.json({
          director: {
            level: 1,
            access: "granted",
            control_id: req.body.controlId || 'director_1',
            expires_at_utc: new Date(Date.now() + 300000).toISOString()
          }
        });
      } catch (error) {
        this.logger.error(`Stream director 1 failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/director/5', async (req, res) => {
      try {
        // Payment verification successful - director access granted
        this.logger.info(`Director 5 access granted for ${req.body.controlId || 'default_user'}`);
        
        res.json({
          director: {
            level: 5,
            access: "granted",
            control_id: req.body.controlId || 'director_5',
            expires_at_utc: new Date(Date.now() + 300000).toISOString()
          }
        });
      } catch (error) {
        this.logger.error(`Stream director 5 failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/director/10', async (req, res) => {
      try {
        // Payment verification successful - director access granted
        this.logger.info(`Director 10 access granted for ${req.body.controlId || 'default_user'}`);
        
        res.json({
          director: {
            level: 10,
            access: "granted",
            control_id: req.body.controlId || 'director_10',
            expires_at_utc: new Date(Date.now() + 300000).toISOString()
          }
        });
      } catch (error) {
        this.logger.error(`Stream director 10 failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { DirectorRouter };