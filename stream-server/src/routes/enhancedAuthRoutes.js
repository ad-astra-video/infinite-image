const express = require('express');
const SIWEWithEphemeralHandler = require('../auth/siweWithEphemeral');
const { sessionMiddleware, validateSession } = require('../auth/ironSessionConfig');

/**
 * Enhanced Auth Routes with Hybrid SIWE + Ephemeral Delegation
 * Replaces the legacy authRoutes.js with advanced security features
 */
class EnhancedAuthRoutes {
  constructor(config = {}) {
    this.router = express.Router();
    this.logger = config.logger || console;
    this.siweHandler = new SIWEWithEphemeralHandler(config);
    
    // Apply session middleware to all routes
    this.router.use(sessionMiddleware);

    this.setupRoutes();
  }

  /**
   * Get session cache for external validation
   * @returns {SessionCache} Session cache instance
   */
  getSessionCache() {
    return this.siweHandler.sessionCache;
  }

  /**
   * Setup all authentication routes
   */
  setupRoutes() {
    // Generate SIWE nonce with ephemeral key binding
    this.router.post('/siwe/nonce', this.handleGenerateNonce.bind(this));

    // Enhanced SIWE verification with delegation
    this.router.post('/verify', this.handleSIWEVerification.bind(this));

    // Check session status with enhanced validation
    this.router.get('/session/status', validateSession, this.handleSessionStatus.bind(this));

    // Logout with secure session destruction
    this.router.post('/logout', validateSession, this.handleLogout.bind(this));

    // Get auth statistics (debug endpoint)
    this.router.get('/stats', this.handleStats.bind(this));
  }

  /**
   * Generate secure SIWE nonce bound to ephemeral key
   */
  async handleGenerateNonce(req, res) {
    try {
      const { ephemeralPublicKey } = req.body;

      if (!ephemeralPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_EPHEMERAL_KEY',
          message: 'ephemeralPublicKey is required'
        });
      }

      // Generate secure nonce bound to ephemeral key
      const nonceData = await this.siweHandler.generateSecureNonce(ephemeralPublicKey, req);

      this.logger.info('SIWE nonce generated:', {
        ephemeralKey: ephemeralPublicKey.substring(0, 8) + '...',
        ip: req.ip
      });

      res.json({
        success: true,
        data: nonceData
      });
    } catch (error) {
      this.logger.error('Error generating SIWE nonce:', error);
      res.status(500).json({
        success: false,
        error: 'NONCE_GENERATION_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Enhanced SIWE verification with ephemeral delegation
   */
  async handleSIWEVerification(req, res) {
    console.log('🔍 DEBUG BACKEND: SIWE verification request received')
    console.log('🔍 DEBUG BACKEND: Request body:', {
      signature: req.body.signature ? 'present' : 'missing',
      siweMessage: req.body.siweMessage ? 'present' : 'missing',
      address: req.body.address
    })
    
    try {
      const { signature, siweMessage, address } = req.body;

      if (!signature || !siweMessage || !address) {
        console.log('🔍 DEBUG BACKEND: Missing required fields')
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'signature, siweMessage, and address are required'
        });
      }

      // Validate address format
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_FORMAT',
          message: 'Invalid Ethereum address format'
        });
      }

      // Enhanced SIWE verification with ephemeral delegation
      const verification = await this.siweHandler.verifyEnhancedSIWE(req, signature, siweMessage);

      if (!verification.success) {
        this.logger.warn('SIWE verification failed:', {
          address: address,
          error: verification.error
        });

        return res.status(401).json({
          success: false,
          error: verification.error,
          reason: verification.reason
        });
      }

      // Store verified data in iron-session
      req.session.address = verification.address;
      req.session.siwe = {
        signature: verification.siweData.signature,
        nonce: verification.siweData.nonce,
        expiresAt: verification.siweData.expiresAt,
        verifiedAt: Date.now()
      };
      req.session.ephemeral = {
        publicKey: verification.delegation.ephemeralPublicKey,
        expiresAt: verification.delegation.expiresAt
      };
      req.session.fingerprint = {
        ipHash: this.siweHandler.hashIP(req.ip),
        uaHash: this.siweHandler.hashUA(req.get('User-Agent')),
        createdAt: Date.now(),
        lastSeen: Date.now()
      };

      await req.session.save();

      this.logger.info('Enhanced SIWE verification successful:', {
        address: verification.address,
        ephemeralKey: verification.delegation.ephemeralPublicKey.substring(0, 8) + '...'
      });

      console.log('🔍 DEBUG BACKEND: SIWE verification successful!')
      console.log('🔍 DEBUG BACKEND: Session data stored:', {
        address: verification.address,
        ephemeralKey: verification.delegation.ephemeralPublicKey.substring(0, 8) + '...'
      })
      
      res.json({
        success: true,
        data: {
          address: verification.address,
          sessionEstablished: true,
          ephemeralKey: verification.delegation.ephemeralPublicKey,
          expiresAt: verification.delegation.expiresAt
        }
      });
    } catch (error) {
      console.log('🔍 DEBUG BACKEND: SIWE verification failed:', error.message)
      this.logger.error('SIWE verification error:', error);
      res.status(500).json({
        success: false,
        error: 'VERIFICATION_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Enhanced session status check
   */
  async handleSessionStatus(req, res) {
    try {
      const session = req.session;
      
      // Check if session has all required data
      const hasRequiredData = session?.address && session?.siwe && session?.ephemeral;
      
      if (!hasRequiredData) {
        return res.json({
          success: true,
          data: {
            authenticated: false,
            reason: 'incomplete_session'
          }
        });
      }

      // Check expiration
      const now = Date.now();
      const siweExpired = session.siwe.expiresAt && now > session.siwe.expiresAt;
      const ephemeralExpired = session.ephemeral.expiresAt && now > session.ephemeral.expiresAt;

      if (siweExpired || ephemeralExpired) {
        await req.session.destroy();
        return res.json({
          success: true,
          data: {
            authenticated: false,
            reason: 'session_expired'
          }
        });
      }

      // Session is valid
      res.json({
        success: true,
        data: {
          authenticated: true,
          address: session.address,
          counter: session.ephemeral.counter,
          expiresAt: Math.min(session.siwe.expiresAt, session.ephemeral.expiresAt)
        }
      });
    } catch (error) {
      this.logger.error('Session status check error:', error);
      res.status(500).json({
        success: false,
        error: 'STATUS_CHECK_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Secure logout with session destruction
   */
  async handleLogout(req, res) {
    try {
      const session = req.session;
      const address = session?.address;

      // Destroy session
      await req.session.destroy();

      this.logger.info('Session destroyed:', {
        address: address || 'unknown',
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Session destroyed successfully'
      });
    } catch (error) {
      this.logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'LOGOUT_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Get authentication statistics (debug endpoint)
   */
  async handleStats(req, res) {
    try {
      const stats = {
        siweHandler: this.siweHandler.getStatistics(),
        session: {
          hasSession: !!req.session,
          address: req.session?.address,
          counter: req.session?.ephemeral?.counter || 0
        },
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.logger.error('Stats error:', error);
      res.status(500).json({
        success: false,
        error: 'STATS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Get router instance
   */
  getRouter() {
    return this.router;
  }
}

module.exports = { EnhancedAuthRoutes };