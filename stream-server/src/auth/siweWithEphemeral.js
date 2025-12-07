const { SiweMessage } = require('siwe');
const crypto = require('crypto');
const { ethers } = require('ethers');

/**
 * SIWE + Ephemeral Delegation Handler
 * Enhances standard SIWE with ephemeral key delegation for secure message signing
 */
class SIWEWithEphemeralHandler {
  constructor(config = {}) {
    this.nonceStore = new Map(); // nonce → ephemeralPublicKey + metadata
    this.delegationStore = new Map(); // userAddress → delegationData
    this.logger = config.logger || console;
    this.nonceExpirationMinutes = config.nonceExpirationMinutes || 30;
    this.delegationExpirationMinutes = config.delegationExpirationMinutes || 30;
    this.maxNonceAge = this.nonceExpirationMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Generate secure nonce bound to ephemeral key hash
   * @param {string} ephemeralPublicKey - Hash of ephemeral public key
   * @param {object} req - Express request object
   * @returns {Promise<object>} { nonce, ephemeralPublicKey }
   */
  async generateSecureNonce(ephemeralPublicKey, req) {
    try {
      // Validate ephemeral public key format
      if (!this.isValidEphemeralPublicKey(ephemeralPublicKey)) {
        throw new Error('Invalid ephemeral public key format');
      }

      // Generate cryptographically secure nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      
      // Create nonce metadata with security bindings
      const nonceData = {
        ephemeralPublicKey,
        ipHash: this.hashIP(req.ip),
        uaHash: this.hashUA(req.get('User-Agent')),
        issuedAt: Date.now(),
        expiresAt: Date.now() + this.maxNonceAge,
        requestCount: 1,
        maxAge: this.maxNonceAge
      };

      // Store nonce with metadata
      this.nonceStore.set(nonce, nonceData);
      
      this.logger.info('Generated secure SIWE nonce:', {
        ephemeralPublicKey: ephemeralPublicKey.substring(0, 8) + '...',
        ipHash: nonceData.ipHash.substring(0, 8) + '...',
        issuedAt: new Date(nonceData.issuedAt).toISOString()
      });

      return { nonce, ephemeralPublicKey };
    } catch (error) {
      this.logger.error('Error generating secure nonce:', error);
      throw new Error('Failed to generate secure nonce');
    }
  }

  /**
   * Enhanced SIWE verification with ephemeral delegation validation
   * @param {object} req - Express request object
   * @param {string} signature - SIWE signature hex
   * @param {object} siweMessage - SIWE message object
   * @returns {Promise<object>} Verification result
   */
  async verifyEnhancedSIWE(req, signature, siweMessage) {
    console.log('🔍 DEBUG SIWE HANDLER: Starting verification')
    console.log('🔍 DEBUG SIWE HANDLER: SIWE message statement:', siweMessage.statement)
    
    try {
      // Parse and validate SIWE message
      const siweMessageObj = new SiweMessage(siweMessage);
      console.log('🔍 DEBUG SIWE HANDLER: SIWE message parsed successfully')
      
      // Verify SIWE signature using standard method
      const fields = await siweMessageObj.verify({ signature });
      console.log('🔍 DEBUG SIWE HANDLER: SIWE signature verified successfully')
      
      // Extract delegation data from SIWE message statement
      const delegation = this.parseDelegationFromStatement(siweMessageObj.statement);
      console.log('🔍 DEBUG SIWE HANDLER: Delegation data parsed:', delegation)
      
      // If no delegation found, try to extract ephemeral key from statement
      let ephemeralKeyInStatement = null;
      if (!delegation) {
        console.log('🔍 DEBUG SIWE HANDLER: No delegation found in SIWE message')
        throw new Error('No ephemeral delegation found in SIWE message');
      }

      // Validate nonce binding
      const nonceData = this.nonceStore.get(siweMessageObj.nonce);
      if (!nonceData) {
        throw new Error('Nonce missing, expired, or already used');
      }

      // Verify nonce expiration
      if (Date.now() > nonceData.expiresAt) {
        this.nonceStore.delete(siweMessageObj.nonce);
        throw new Error('Nonce has expired');
      }

      // Verify ephemeral key binding (either from delegation or statement)
      const keyToVerify = delegation?.ephemeralPublicKey || ephemeralKeyInStatement;
      if (!keyToVerify) {
        throw new Error('No ephemeral key found in SIWE message');
      }
      
      if (keyToVerify !== nonceData.ephemeralPublicKey) {
        throw new Error('Ephemeral key mismatch in SIWE message');
      }

      // Verify delegation expiration
      const delegationExpiration = siweMessageObj.expirationTime;
      if (Date.now() > delegationExpiration) {
        throw new Error('Ephemeral delegation has expired');
      }

      // Verify IP/User-Agent binding (optional security enhancement)
      const currentIPHash = this.hashIP(req.ip);
      const currentUAHash = this.hashUA(req.get('User-Agent'));
      
      if (nonceData.ipHash !== currentIPHash || nonceData.uaHash !== currentUAHash) {
        this.logger.warn('SIWE nonce binding mismatch - possible security issue:', {
          expectedIP: nonceData.ipHash.substring(0, 8) + '...',
          actualIP: currentIPHash.substring(0, 8) + '...',
          expectedUA: nonceData.uaHash.substring(0, 8) + '...',
          actualUA: currentUAHash.substring(0, 8) + '...'
        });
        // Log but don't reject - could be legitimate cross-device usage
      }

      // Validate ephemeral public key format
      if (!this.isValidEthereumAddress(delegation.ephemeralPublicKey)) {
        throw new Error('Invalid ephemeral public key format');
      }

      // Store delegation data for future message validation
      delegation.expiresAt = siweMessageObj.expirationTime;
      delegation.counter = 0
      this.storeDelegationData(delegation, fields.data.address);

      // Clean up used nonce
      this.nonceStore.delete(siweMessageObj.nonce);

      this.logger.info('Enhanced SIWE verification successful:', {
        address: fields.data.address.toLowerCase(),
        ephemeralKey: delegation.ephemeralPublicKey.substring(0, 8) + '...',
        delegationExpires: new Date(delegationExpiration).toISOString()
      });

      return {
        success: true,
        address: fields.data.address.toLowerCase(),
        delegation: {
          ephemeralPublicKey: delegation.ephemeralPublicKey,
          expiration: delegation.expiresAt,
          counter: delegation.counter
        },
        siweData: {
          signature,
          nonce: siweMessageObj.nonce,
          expiresAt: siweMessageObj.expirationTime
        }
      };
    } catch (error) {
      this.logger.error('Enhanced SIWE verification failed:', error);
      return {
        success: false,
        error: error.message,
        reason: 'SIWE_VERIFICATION_FAILED'
      };
    }
  }

  /**
   * Parse delegation from SIWE statement if embedded there
   * @param {string} statement - SIWE statement text
   * @returns {object|null} Delegation data or null
   */
  parseDelegationFromStatement(statement) {
    try {
      if (!statement || typeof statement !== 'string') return null;

      // Look for delegation pattern in statement - check for "ephemeralPublicKey="
          console.log('🔍 DEBUG SIWE HANDLER: Parsing statement for delegation:', statement)
          const bindingMatch = statement.match(/ephemeralPublicKey=+(.*)/i);
          console.log('🔍 DEBUG SIWE HANDLER: Regex match result:', bindingMatch)
          
          if (bindingMatch) {
            const delegationString = bindingMatch[1];
            console.log('🔍 DEBUG SIWE HANDLER: Found delegation string:', delegationString);
            
            if (delegationString) {
              console.log('🔍 DEBUG SIWE HANDLER: Parsed delegation data:', delegationString);
              return {
                ephemeralPublicKey: delegationString.trim(),
              };
            }
          }
          
          console.log('🔍 DEBUG SIWE HANDLER: No delegation found in statement:', statement);
          return null;
        } catch (error) {
          console.error('🔍 DEBUG SIWE HANDLER: Error parsing delegation from statement:', error);
          return null;
        }
      }

  /**
   * Store delegation data for future message validation
   * @param {object} delegation - Delegation data
   * @param {string} address - Ethereum address
   */
  storeDelegationData(delegation, address) {
    // Always normalize address to lowercase for consistent storage
    const normalizedAddress = (address || '').toLowerCase();
    
    const delegationData = {
      address: normalizedAddress,
      ephemeralPublicKey: delegation.ephemeralPublicKey?.toLowerCase() || delegation.ephemeralPublicKey,
      expiresAt: delegation.expiresAt,
      counter: delegation.counter,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };

    this.delegationStore.set(normalizedAddress, delegationData);
    
    this.logger.info('Delegation stored:', {
      originalAddress: address,
      normalizedAddress: normalizedAddress,
      ephemeralPublicKey: delegation.ephemeralPublicKey,
      normalizedEphemeralKey: delegation.ephemeralPublicKey?.toLowerCase(),
      storeSize: this.delegationStore.size
    });
  }

  /**
   * Get delegation data for validation by user address
   * @param {string} userAddress - User's Ethereum address
   * @returns {object|null} Delegation data or null
   */
  getDelegationDataByAddress(userAddress) {
    // Always normalize address to lowercase for consistent lookup
    const normalizedAddress = (userAddress || '').toLowerCase();
    this.logger.info('Looking up delegation for address:', {
      originalAddress: userAddress,
      normalizedAddress: normalizedAddress
    });
    this.logger.info('Delegation store size:', this.delegationStore.size);
    
    const delegation = this.delegationStore.get(normalizedAddress);
    if (!delegation) {
      this.logger.warn('No delegation found for address:', normalizedAddress);
      return null;
    }

    // Check expiration
    if (Date.now() > new Date(delegation.expiresAt).getTime()) {
      this.logger.warn('Delegation expired for address:', normalizedAddress);
      this.delegationStore.delete(normalizedAddress);
      return null;
    }

    this.logger.info('Delegation found for address:', {
      normalizedAddress: normalizedAddress,
      ephemeralPublicKey: delegation.ephemeralPublicKey,
      normalizedEphemeralKey: delegation.ephemeralPublicKey?.toLowerCase(),
      expiresAt: delegation.expiresAt
    });
    
    return delegation;
  }

  /**
   * Validate ephemeral public key format
   * @param {string} key - Key to validate
   * @returns {boolean} True if valid format
   */
  isValidEphemeralPublicKey(ephemeralPublicKey) {
    return ephemeralPublicKey && typeof ephemeralPublicKey === 'string' &&
           ephemeralPublicKey.length === 42 && ephemeralPublicKey.startsWith('0x');
  }

  /**
   * Validate Ethereum address format
   * @param {string} address - Address to validate
   * @returns {boolean} True if valid format
   */
  isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Generate IP hash for security binding
   * @param {string} ip - IP address
   * @returns {string} SHA256 hash
   */
  hashIP(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(ip).digest('hex');
  }

  /**
   * Generate User-Agent hash for security binding
   * @param {string} userAgent - User-Agent string
   * @returns {string} SHA256 hash
   */
  hashUA(userAgent) {
    if (!userAgent) return 'unknown';
    return crypto.createHash('sha256').update(userAgent).digest('hex');
  }

  /**
   * Clean up expired nonces and delegations
   * Called periodically to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up expired nonces
    for (const [nonce, data] of this.nonceStore.entries()) {
      if (now > data.expiresAt) {
        this.nonceStore.delete(nonce);
      }
    }

    // Clean up expired delegations
    for (const [ephemeralKey, data] of this.delegationStore.entries()) {
      if (now > new Date(data.expiresAt).getTime()) {
        this.delegationStore.delete(ephemeralKey);
      }
    }

    this.logger.info('Cleanup completed:', {
      remainingNonces: this.nonceStore.size,
      remainingDelegations: this.delegationStore.size
    });
  }

  /**
   * Update delegation counter for chat message validation
   * @param {string} userAddress - User's Ethereum address
   * @param {number} newCounter - New counter value
   * @returns {boolean} True if updated successfully
   */
  updateDelegationCounter(userAddress, newCounter) {
    try {
      const address = userAddress.toLowerCase();
      const delegation = this.delegationStore.get(address);
      if (delegation) {
        this.logger.info('🔄 Updating delegation counter:', {
          address: address.substring(0, 8) + '...',
          oldCounter: delegation.counter,
          newCounter: newCounter
        })
        delegation.counter = newCounter;
        delegation.lastUsed = Date.now();
        this.delegationStore.set(address, delegation);
        return true;
      } else {
        this.logger.warn('⚠️ No delegation found for address:', address.substring(0, 8) + '...')
      }
      return false;
    } catch (error) {
      this.logger.error('Error updating delegation counter:', error);
      return false;
    }
  }

  /**
   * Get statistics for monitoring
   * @returns {object} Statistics object
   */
  getStatistics() {
    return {
      activeNonces: this.nonceStore.size,
      activeDelegations: this.delegationStore.size,
      nonceExpirationMinutes: this.nonceExpirationMinutes,
      delegationExpirationMinutes: this.delegationExpirationMinutes
    };
  }
}

module.exports = SIWEWithEphemeralHandler;