const express = require('express');
const SIWEMessageGenerator = require('../auth/siwe');
const SessionCache = require('../auth/sessionCache');

class AuthRouter {
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.router = express.Router();
    
    // Initialize SIWE message generator
    this.messageGenerator = new SIWEMessageGenerator({
      domain: config.domain || 'x402-Stream.com',
      uri: config.uri || 'https://x402-Stream.com',
      expirationMinutes: 5 // 5 minutes for login
    });

    // Initialize session cache
    this.sessionCache = new SessionCache({
      logger: this.logger,
      expirationMinutes: 1440 // 24 hours
    });

    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Generate SIWE nonce for signing
    this.router.get('/siwe/nonce', (req, res) => {
      try {
        const nonce = this.messageGenerator.generateNonce();

        this.logger.info('Generated SIWE nonce');

        res.json({
          success: true,
          data: {
            nonce: nonce
          }
        });

      } catch (error) {
        this.logger.error('Error generating SIWE nonce:', error);
        res.status(500).json({
          error: 'Failed to generate SIWE nonce',
          details: error.message
        });
      }
    });

    // Verify SIWE signature and create session
    this.router.post('/verify', async (req, res) => {
      try {
        const { signature, siweMessage, address } = req.body;

        if (!signature || !siweMessage || !address) {
          return res.status(400).json({ 
            error: 'Missing required fields: signature, siweMessage, address' 
          });
        }

        // Validate address format
        if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
          return res.status(400).json({ 
            error: 'Invalid address format' 
          });
        }

        // Verify signature
        const verification = await this.sessionCache.verifySignature(
          signature, 
          siweMessage, 
          address
        );

        if (!verification.valid) {
          this.logger.warn(`SIWE signature verification failed: ${verification.reason}`);
          return res.status(401).json({ 
            error: 'Signature verification failed',
            reason: verification.reason,
            details: verification.errors || verification.error
          });
        }

        // Create session token
        const sessionToken = this.sessionCache.createSession(
          address, 
          signature, 
          siweMessage
        );

        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

        this.logger.info(`SIWE verification successful for address: ${address}`);

        res.json({
          success: true,
          data: {
            token: sessionToken,
            address: address,
            signature: signature,
            validated: true,
            expiresAt: expiresAt
          }
        });

      } catch (error) {
        this.logger.error('Error verifying SIWE signature:', error);
        res.status(500).json({ 
          error: 'Failed to verify signature',
          details: error.message 
        });
      }
    });

    // Check authentication status
    this.router.get('/status', (req, res) => {
      try {
        const { address } = req.query;
        const token = req.headers.authorization?.replace('Bearer ', '');

        // Check session token first
        if (token) {
          const sessionStatus = this.sessionCache.getSessionStatus(token);
          if (sessionStatus.validated) {
            return res.json({
              success: true,
              data: sessionStatus
            });
          }
        }

        // Fallback to signature cache validation
        if (address) {
          const signatureStatus = this.sessionCache.getSignatureStatus(address);
          if (signatureStatus.validated) {
            return res.json({
              success: true,
              data: signatureStatus
            });
          }
        }

        // No valid authentication found
        res.json({
          success: true,
          data: {
            validated: false,
            reason: 'no_valid_session'
          }
        });

      } catch (error) {
        this.logger.error('Error checking auth status:', error);
        res.status(500).json({ 
          error: 'Failed to check authentication status',
          details: error.message 
        });
      }
    });

    // Revoke session (for logout)
    this.router.post('/revoke', (req, res) => {
      try {
        const { token } = req.body;

        if (!token) {
          return res.status(400).json({ 
            error: 'Missing required parameter: token' 
          });
        }

        const success = this.sessionCache.revokeSession(token);

        if (success) {
          this.logger.info(`SIWE session revoked: ${token}`);
          res.json({
            success: true,
            message: 'Session revoked successfully'
          });
        } else {
          res.status(404).json({ 
            error: 'Session not found' 
          });
        }

      } catch (error) {
        this.logger.error('Error revoking session:', error);
        res.status(500).json({ 
          error: 'Failed to revoke session',
          details: error.message 
        });
      }
    });

    // Get cache statistics (debug endpoint)
    this.router.get('/stats', (req, res) => {
      try {
        const stats = this.sessionCache.getStats();
        res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        this.logger.error('Error getting cache stats:', error);
        res.status(500).json({ 
          error: 'Failed to get cache statistics',
          details: error.message 
        });
      }
    });
  }

  /**
   * Get Express router
   * @returns {express.Router} Configured router
   */
  getRouter() {
    return this.router;
  }

  /**
   * Get session cache instance
   * @returns {SessionCache} Session cache instance
   */
  getSessionCache() {
    return this.sessionCache;
  }
}

module.exports = { AuthRouter };