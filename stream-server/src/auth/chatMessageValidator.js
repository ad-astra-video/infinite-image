const { ethers } = require('ethers');

/**
 * Chat Message Validator
 * Validates chat messages signed with ephemeral keys using monotonic counter and timestamp
 * Uses delegationStore lookup by userAddress for WebSocket validation
 */
class ChatMessageValidator {
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.messageStore = new Map(); // Store recent messages for replay detection
    this.maxMessageAge = config.maxMessageAge || 5 * 60 * 1000; // 5 minutes
    this.cleanupInterval = config.cleanupInterval || 60 * 1000; // 1 minute
    this.siweHandler = config.siweHandler; // SIWE handler with delegationStore
    
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Validate chat message with anti-replay protection
   * Uses delegationStore lookup by userAddress
   * @param {object} req - Express request object OR WebSocket context
   * @param {object} params - { message, signature, counter, userAddress, ephemeralPublicKey? }
   * @returns {Promise<object>} Validation result
   */
  async validateChatMessage({ message, signature, counter, userAddress }) {
    try {
      let delegation = null;
            
      // Handle delegationStore lookup by userAddress (preferred method)
      // Skip delegation validation for anonymous users
      if (userAddress && userAddress !== 'anon' && this.siweHandler) {
        delegation = this.siweHandler.getDelegationDataByAddress(userAddress);
        if (!delegation) {
          throw new Error('No valid delegation found for user address');
        }
      }

      // Skip delegation validation for anonymous users - they don't need signatures
      if (userAddress !== 'anon') {
        if (!delegation || !delegation.ephemeralPublicKey) {
          throw new Error('Invalid delegation - missing ephemeral public key');
        }

        // Check delegation expiration
        const now = Date.now();
        if (delegation.expiresAt && now > new Date(delegation.expiresAt).getTime()) {
          this.logger.warn('⏰ Delegation expired:', {
            expiresAt: delegation.expiresAt,
            now: new Date(now).toISOString()
          })
          throw new Error('Ephemeral delegation expired');
        }

        // Validate monotonic counter
        this.logger.info('🔢 Counter validation:', {
          storedCounter: delegation.counter,
          receivedCounter: counter,
          expectedNext: delegation.counter !== undefined ? delegation.counter + 1 : undefined
        })
        
        if (delegation.counter !== undefined) {
          if (delegation.counter + 1 !== counter) {
            this.logger.error('❌ Counter mismatch:', {
              stored: delegation.counter,
              expected: delegation.counter + 1,
              received: counter
            })
            throw new Error(`Counter mismatch. Expected ${delegation.counter + 1}, received ${counter}`);
          }
        } else {
          this.logger.warn('⚠️ No stored counter found - this may indicate first message or missing delegation update')
        }
        
        // Verify signature with ephemeral public key
        const isValidSignature = this.verifyEphemeralSignature(message, signature, delegation.ephemeralPublicKey);
        if (!isValidSignature) {
          throw new Error('Invalid ephemeral signature');
        }
      }
      
      // Skip replay detection for anonymous users - they are managed by cooldown time
      if (userAddress !== 'anon') {
        const addressToCheck = userAddress || delegation?.address;
        const replayCheck = this.checkForReplay(message, addressToCheck, counter);
        if (replayCheck.isReplay) {
          throw new Error('Message replay detected: ' + replayCheck.reason);
        }
      }
      
      // Update counter only for non-anonymous users with delegation data
      // Anonymous users always have counter = 0, no counter validation needed
      if (userAddress !== 'anon' && delegation && delegation.counter !== undefined) {
        if (counter !== delegation.counter + 1) {
          this.logger.error('❌ Counter mismatch on update:', {
            stored: delegation.counter,
            expected: delegation.counter + 1,
            received: counter
          })
          throw new Error(`Counter mismatch on update. Expected ${delegation.counter + 1}, received ${counter}`);
        }
        
        // Update the delegation in the store
        if (this.siweHandler) {
          this.logger.info('🔄 Updating delegation counter:', {
            oldCounter: delegation.counter,
            newCounter: counter,
            userAddress: userAddress?.substring(0, 8) + '...'
          })
          this.siweHandler.updateDelegationCounter(userAddress, counter);
        }
      } else if (userAddress !== 'anon' && delegation) {
        this.logger.info('🆕 First message for user - initializing counter:', {
          userAddress: userAddress?.substring(0, 8) + '...',
          counter: counter
        })
        // Initialize counter for first message
        if (this.siweHandler) {
          this.siweHandler.updateDelegationCounter(userAddress, counter);
        }
      } else if (userAddress === 'anon') {
        this.logger.info('👤 Anonymous user - counter always zero, no counter tracking needed:', {
          userAddress: userAddress,
          counter: counter
        })
      }

      return {
        isValid: true,
        address: userAddress === 'anon' ? 'anon' : (userAddress || delegation?.address),
        validated: userAddress !== 'anon', // Anonymous users are not validated
        sessionType: userAddress === 'anon' ? 'anonymous' : 'delegation-store',
        ephemeral: userAddress === 'anon' ? null : delegation
      };
    } catch (error) {
      this.logger.warn('Chat message validation failed:', error.message);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Format iron session data for validation
   * @param {object} ironSessionData - Iron session data from WebSocket
   * @returns {object} Formatted session data
   */
  formatIronSessionData(ironSessionData) {
    const sessionData = ironSessionData.sessionData || ironSessionData;
    
    return {
      address: sessionData.address,
      siwe: sessionData.siwe || {},
      ephemeral: sessionData.ephemeral || null,
      fingerprint: sessionData.fingerprint || null
    };
  }

  /**
   * Verify ephemeral signature using ethers.js
   * @param {string} messageString - Message string to verify
   * @param {string} signature - Signature hex
   * @param {string} publicKey - Ephemeral public key
   * @returns {boolean} Is valid signature
   */
  verifyEphemeralSignature(messageString, signature, publicKey) {
    try {
      // Skip signature verification for anonymous users with blank signatures
      if (!publicKey || !signature || signature === '') {
        if (signature === '') {
          this.logger.info('🔍 Skipping signature verification for anonymous user with blank signature');
          return true;
        }
        return false;
      }

      // Verify signature
      const recoveredAddress = ethers.verifyMessage(messageString, signature);

      return recoveredAddress.toLowerCase() === publicKey.toLowerCase();
    } catch (error) {
      this.logger.warn('Ephemeral signature verification failed:', error.message);
      return false;
    }
  }

  /**
   * Check for replay attacks
   * @param {string} message - Chat message
   * @param {string} address - User address
   * @param {number} counter - Message counter
   * @returns {object} Replay check result
   */
  checkForReplay(message, address, counter) {
    const messageKey = `${address}:${counter}`;
    const now = Date.now();
    
    // Check if message already exists (replay attack)
    if (this.messageStore.has(messageKey)) {
      return { isReplay: true, reason: 'Message already processed' };
    }
    
    // Check for old messages (potential replay)
    const recentMessages = Array.from(this.messageStore.entries())
      .filter(([key, data]) => key.startsWith(`${address}:`))
      .filter(([key, data]) => now - data.timestamp > this.maxMessageAge);
    
    if (recentMessages.length > 10) {
      return { isReplay: true, reason: 'Too many recent messages from this address' };
    }
    
    // Store new message
    this.messageStore.set(messageKey, {
      message,
      timestamp: now,
      address
    });
    
    return { isReplay: false };
  }

  /**
   * Clean up expired messages
   */
  cleanupExpiredMessages() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, data] of this.messageStore.entries()) {
      if (now - data.timestamp > this.maxMessageAge) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.messageStore.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      this.logger.info(`Cleaned up ${expiredKeys.length} expired messages`);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, this.cleanupInterval);
  }

  /**
   * Get validation statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      messageStoreSize: this.messageStore.size,
      maxMessageAge: this.maxMessageAge,
      cleanupInterval: this.cleanupInterval
    };
  }
}

module.exports = ChatMessageValidator;
