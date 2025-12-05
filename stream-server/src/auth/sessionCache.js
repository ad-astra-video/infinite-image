const { ethers } = require('ethers');
const SIWEMessageGenerator = require('./siwe');

class SessionCache {
  constructor(config = {}) {
    this.sessions = new Map(); // sessionToken -> sessionData
    this.signatureCache = new Map(); // address -> signatureData
    this.expirationMinutes = config.expirationMinutes || 1440; // 24 hours
    this.cleanupInterval = config.cleanupInterval || 60000; // 1 minute
    this.logger = config.logger || console;
    
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Create session token and cache session data
   * @param {string} address - Ethereum address
   * @param {string} signature - Signature hex
   * @param {object} siweMessage - SIWE message data
   * @returns {string} sessionToken
   */
  createSession(address, signature, siweMessage) {
    const sessionToken = this.generateSessionToken();
    const now = Date.now();
    const expiresAt = now + (this.expirationMinutes * 60 * 1000);

    const sessionData = {
      token: sessionToken,
      address: address.toLowerCase(),
      signature: signature,
      siweMessage: siweMessage,
      validated: true,
      createdAt: now,
      lastAccessed: now,
      expiresAt: expiresAt,
      revoked: false
    };

    // Cache session
    this.sessions.set(sessionToken, sessionData);

    // Cache signature validation
    this.cacheSignature(address, signature, siweMessage, expiresAt);

    this.logger.info(`Created SIWE session for address: ${address}`);
    return sessionToken;
  }

  /**
   * Validate session token
   * @param {string} token - Session token
   * @returns {object} Validation result
   */
  validateSession(token) {
    if (!token) {
      return { valid: false, reason: 'no_token' };
    }

    const session = this.sessions.get(token);
    
    if (!session) {
      return { valid: false, reason: 'not_found' };
    }

    if (session.revoked) {
      return { valid: false, reason: 'revoked' };
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return { valid: false, reason: 'expired' };
    }

    // Update last accessed
    session.lastAccessed = Date.now();
    this.sessions.set(token, session);

    return { 
      valid: true, 
      session,
      address: session.address,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Cache signature validation by address
   * @param {string} address - Ethereum address
   * @param {string} signature - Signature hex
   * @param {object} siweMessage - SIWE message data
   * @param {number} expiresAt - Expiration timestamp
   */
  cacheSignature(address, signature, siweMessage, expiresAt) {
    const signatureData = {
      address: address.toLowerCase(),
      signature: signature,
      siweMessage: siweMessage,
      validated: true,
      expiresAt: expiresAt,
      timestamp: Date.now()
    };

    this.signatureCache.set(address.toLowerCase(), signatureData);
  }

  /**
   * Validate signature by address
   * @param {string} address - Ethereum address
   * @returns {object} Validation result
   */
  validateSignature(address) {
    const addressKey = address.toLowerCase();
    const signatureData = this.signatureCache.get(addressKey);
    
    if (!signatureData) {
      return { valid: false, reason: 'not_found' };
    }

    if (Date.now() > signatureData.expiresAt) {
      this.signatureCache.delete(addressKey);
      return { valid: false, reason: 'expired' };
    }

    return { 
      valid: true,
      address: signatureData.address,
      expiresAt: signatureData.expiresAt
    };
  }

  /**
   * Verify signature against SIWE message
   * @param {string} signature - Signature hex
   * @param {object} siweMessage - SIWE message data
   * @param {string} expectedAddress - Expected Ethereum address
   * @returns {Promise<object>} Verification result
   */
  async verifySignature(signature, siweMessage, expectedAddress) {
    try {
      // Use the SIWE message generator to verify
      const messageGenerator = new SIWEMessageGenerator();
      const result = await messageGenerator.verifySignature(signature, siweMessage, expectedAddress);
      
      return result;
    } catch (error) {
      return { valid: false, reason: 'verification_error', error: error.message };
    }
  }

  /**
   * Generate session token
   * @returns {string} Random session token
   */
  generateSessionToken() {
    return 'siwe_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  }

  /**
   * Revoke session token
   * @param {string} token - Session token to revoke
   * @returns {boolean} Success status
   */
  revokeSession(token) {
    const session = this.sessions.get(token);
    if (session) {
      session.revoked = true;
      this.sessions.set(token, session);
      this.logger.info(`Revoked SIWE session: ${token}`);
      return true;
    }
    return false;
  }

  /**
   * Get session status
   * @param {string} token - Session token
   * @returns {object} Session status
   */
  getSessionStatus(token) {
    const validation = this.validateSession(token);
    
    if (validation.valid) {
      return {
        validated: true,
        address: validation.session.address,
        expiresAt: validation.session.expiresAt
      };
    }

    return { validated: false, reason: validation.reason };
  }

  /**
   * Get signature validation status by address
   * @param {string} address - Ethereum address
   * @returns {object} Validation status
   */
  getSignatureStatus(address) {
    const validation = this.validateSignature(address);
    
    if (validation.valid) {
      return {
        validated: true,
        address: validation.address,
        expiresAt: validation.expiresAt
      };
    }

    return { validated: false, reason: validation.reason };
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  /**
   * Clean up expired sessions and signatures
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedSignatures = 0;

    // Clean expired sessions
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt || session.revoked) {
        this.sessions.delete(token);
        cleanedSessions++;
      }
    }

    // Clean expired signature cache
    for (const [address, signatureData] of this.signatureCache.entries()) {
      if (now > signatureData.expiresAt) {
        this.signatureCache.delete(address);
        cleanedSignatures++;
      }
    }

    if (cleanedSessions > 0 || cleanedSignatures > 0) {
      this.logger.info(`Cleaned up ${cleanedSessions} expired sessions and ${cleanedSignatures} expired signature cache entries`);
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    return {
      sessions: this.sessions.size,
      signatureCache: this.signatureCache.size,
      expirationMinutes: this.expirationMinutes
    };
  }
}

module.exports = SessionCache;