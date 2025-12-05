const { SiweMessage, generateNonce } = require('siwe');
const { ethers } = require('ethers');

class SIWEMessageGenerator {
  constructor(config = {}) {
    this.domain = config.domain || 'x402-Stream.com';
    this.uri = config.uri || 'https://x402-Stream.com';
    this.version = '1';
    this.expirationMinutes = config.expirationMinutes || 5; // 5 minutes for login
  }

  /**
   * Generate only the nonce for SIWE message
   * @returns {string} nonce
   */
  generateNonce() {
    return generateNonce();
  }

  /**
   * Generate SIWE message object with customizable statement
   * @param {string} statement - Custom statement for the SIWE message
   * @returns {object} SIWE message object with nonce, domain, uri, version, expiration
   */
  generateMessage(statement = 'Sign in with Ethereum to access X402-Stream services') {
    const nonce = this.generateNonce();
    
    return {
      nonce,
      domain: this.domain,
      uri: this.uri,
      version: this.version,
      expirationMinutes: this.expirationMinutes,
      statement: statement
    };
  }

  /**
   * Reconstruct SIWE message string from plain object
   * @param {object} siweMessageObj - SIWE message object
   * @returns {string} SIWE message string
   */
  reconstructMessage(siweMessageObj) {
    try {
      // Create a SiweMessage instance from the plain object
      const siweMessage = new SiweMessage(siweMessageObj);
      return siweMessage.prepareMessage();
    } catch (error) {
      throw new Error(`Failed to reconstruct SIWE message: ${error.message}`);
    }
  }

  /**
   * Verify SIWE signature
   * @param {string} signature - Signature hex
   * @param {object|string} siweMessageData - SIWE message object or string
   * @param {string} expectedAddress - Expected Ethereum address
   * @returns {Promise<object>} Verification result
   */
  async verifySignature(signature, siweMessageData, expectedAddress) {
    try {
      let siweMessage;
      
      // Handle different input types
      if (typeof siweMessageData === 'string') {
        // Parse string message
        siweMessage = new SiweMessage(siweMessageData);
      } else if (typeof siweMessageData === 'object') {
        // Create from object
        siweMessage = new SiweMessage(siweMessageData);
      } else {
        return { valid: false, reason: 'invalid_message_format' };
      }

      // Verify the signature
      try {
        const fields = await siweMessage.verify({ signature });
        
        // Check if the address matches
        if (fields.data.address.toLowerCase() !== expectedAddress.toLowerCase()) {
          return { valid: false, reason: 'address_mismatch' };
        }

        return { 
          valid: true, 
          address: fields.data.address,
          data: fields.data 
        };
      } catch (verifyError) {
        return { 
          valid: false, 
          reason: 'signature_verification_failed',
          error: verifyError.message 
        };
      }
    } catch (error) {
      return { 
        valid: false, 
        reason: 'verification_error', 
        error: error.message 
      };
    }
  }

  /**
   * Parse SIWE message into structured data
   * @param {string} message - SIWE message string
   * @returns {object} Parsed message data
   */
  parseMessage(message) {
    try {
      const siweMessage = new SiweMessage(message);
      return {
        domain: siweMessage.domain,
        address: siweMessage.address,
        statement: siweMessage.statement,
        uri: siweMessage.uri,
        version: siweMessage.version,
        chainId: siweMessage.chainId,
        nonce: siweMessage.nonce,
        issuedAt: siweMessage.issuedAt,
        expirationTime: siweMessage.expirationTime,
        notBefore: siweMessage.notBefore,
        requestId: siweMessage.requestId,
        resources: siweMessage.resources
      };
    } catch (error) {
      throw new Error(`Failed to parse SIWE message: ${error.message}`);
    }
  }

  /**
   * Validate SIWE message structure
   * @param {object} parsedMessage - Parsed SIWE message
   * @returns {object} Validation result
   */
  validateMessage(parsedMessage) {
    const errors = [];

    // Required fields validation
    if (!parsedMessage.domain) errors.push('Missing domain');
    if (!parsedMessage.address) errors.push('Missing address');
    if (!parsedMessage.uri) errors.push('Missing URI');
    if (!parsedMessage.version) errors.push('Missing version');
    if (!parsedMessage.chainId) errors.push('Missing chain ID');
    if (!parsedMessage.nonce) errors.push('Missing nonce');
    if (!parsedMessage.issuedAt) errors.push('Missing issued at');

    // Address format validation
    if (parsedMessage.address && !parsedMessage.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      errors.push('Invalid address format');
    }

    // Version validation
    if (parsedMessage.version && parsedMessage.version !== '1') {
      errors.push('Invalid version');
    }

    // Chain ID validation (basic check)
    if (parsedMessage.chainId && (parsedMessage.chainId < 1 || parsedMessage.chainId > 999999)) {
      errors.push('Invalid chain ID');
    }

    // Date validation
    if (parsedMessage.issuedAt) {
      try {
        new Date(parsedMessage.issuedAt);
      } catch (e) {
        errors.push('Invalid issued at date format');
      }
    }

    if (parsedMessage.expirationTime) {
      try {
        const expiration = new Date(parsedMessage.expirationTime);
        if (expiration <= new Date()) {
          errors.push('Message has expired');
        }
      } catch (e) {
        errors.push('Invalid expiration time format');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = SIWEMessageGenerator;