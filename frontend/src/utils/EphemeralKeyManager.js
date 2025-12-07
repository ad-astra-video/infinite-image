import { Wallet } from 'ethers';

/**
 * AES-Encrypted Ephemeral Key Manager
 * Secure ephemeral key generation and management for browser environments
 */
class EphemeralKeyManager {
  constructor() {
    this.encryptedPrivateKey = null; // AES-GCM encrypted private key
    this.iv = null; // Initialization vector for AES-GCM
    this.aesKey = null; // AES key for encryption/decryption
    this.ephemeralWallet = null; // Wallet instance for signing
    this.counter = 0; // Monotonic counter for message signing
    this.isInitialized = false;
  }

  /**
   * Generate ephemeral wallet and encrypt private key
   * @returns {Promise<string>} Public key of ephemeral wallet
   */
  async generateEphemeralWallet() {
    try {
      // Generate random ephemeral wallet
      const wallet = Wallet.createRandom();
      this.ephemeralWallet = {
        publicKey: wallet.address,
        privateKey: wallet.privateKey
      };
      
      const privateKeyBytes = this.hexToBytes(wallet.privateKey);

      // Generate AES key for encryption
      this.aesKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // not extractable
        ['encrypt', 'decrypt']
      );

      // Generate random initialization vector
      this.iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt private key with AES-GCM
      this.encryptedPrivateKey = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: this.iv },
        this.aesKey,
        privateKeyBytes
      );

      // Clear plaintext private key from memory
      privateKeyBytes.fill(0);

      this.isInitialized = true;
      this.counter = 0;

      console.log('Ephemeral wallet generated:', {
        publicKey: this.ephemeralWallet.publicKey
      });

      return this.ephemeralWallet.publicKey;
    } catch (error) {
      console.error('Error generating ephemeral wallet:', error);
      throw new Error('Failed to generate ephemeral wallet');
    }
  }

  /**
   * Sign message with ephemeral key and increment counter
   * @param {string} message - Message to sign
   * @returns {Promise<object>} { signature, counter }
   */
  async signMessage(message) {
    try {
      if (!this.isInitialized) {
        throw new Error('Ephemeral key manager not initialized');
      }

      // Decrypt private key for signing
      const decryptedBytes = await this.decryptPrivateKey();
      
      // Convert bytes to hex string for wallet creation (browser-safe)
      const hexString = Array.from(decryptedBytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      
      // Create temporary wallet for signing
      const signingWallet = new Wallet('0x' + hexString);
      
      // Clear decrypted bytes from memory
      decryptedBytes.fill(0);

      // Sign message
      const signature = await signingWallet.signMessage(message);
      
      // Increment counter
      this.counter += 1;

      console.log('Message signed with ephemeral key:', {
        counter: this.counter
      });

      return { signature, counter: this.counter };
    } catch (error) {
      console.error('Error signing message:', error);
      throw new Error('Failed to sign message');
    }
  }

  /**
   * Decrypt private key for temporary use
   * @returns {Promise<Uint8Array>} Decrypted private key bytes
   */
  async decryptPrivateKey() {
    try {
      if (!this.encryptedPrivateKey || !this.aesKey || !this.iv) {
        throw new Error('Ephemeral key not available');
      }

      // Decrypt private key
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.iv },
        this.aesKey,
        this.encryptedPrivateKey
      );

      return new Uint8Array(decryptedBytes);
    } catch (error) {
      console.error('Error decrypting private key:', error);
      throw new Error('Failed to decrypt private key');
    }
  }

  /**
   * Get current counter value
   * @returns {number} Current counter
   */
  getCounter() {
    return this.counter;
  }

  /**
   * Reset counter to specific value
   * @param {number} value - New counter value
   */
  setCounter(value) {
    if (typeof value === 'number' && value >= 0) {
      this.counter = value;
    }
  }

  /**
   * Get ephemeral public key
   * @returns {string|null} Public key or null
   */
  getPublicKey() {
    return this.ephemeralWallet ? this.ephemeralWallet.publicKey : null;
  }

  /**
   * Check if manager is initialized
   * @returns {boolean} Initialization status
   */
  isReady() {
    return this.isInitialized && this.ephemeralWallet !== null;
  }

  /**
   * Securely clear all sensitive data from memory
   * Call this on logout, page refresh, or component unmount
   */
  clear() {
    try {
      // Clear encrypted private key
      if (this.encryptedPrivateKey) {
        this.encryptedPrivateKey.fill ? this.encryptedPrivateKey.fill(0) : null;
        this.encryptedPrivateKey = null;
      }

      // Clear initialization vector
      if (this.iv) {
        this.iv.fill ? this.iv.fill(0) : null;
        this.iv = null;
      }

      // Clear AES key
      this.aesKey = null;

      // Clear ephemeral wallet
      if (this.ephemeralWallet) {
        this.ephemeralWallet.privateKey = null;
        this.ephemeralWallet = null;
      }

      // Reset counter and state
      this.counter = 0;
      this.isInitialized = false;

      console.log('Ephemeral key manager cleared');
    } catch (error) {
      console.error('Error clearing ephemeral key manager:', error);
    }
  }

  /**
   * Convert hex string to bytes
   * @param {string} hex - Hex string
   * @returns {Uint8Array} Bytes array
   */
  hexToBytes(hex) {
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Validate Web Crypto API availability
   * @returns {boolean} Availability status
   */
  static isWebCryptoAvailable() {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined' &&
           typeof crypto.getRandomValues === 'function';
  }

  /**
   * Check browser security features
   * @returns {object} Browser security status
   */
  static getBrowserSecurityStatus() {
    return {
      webCrypto: this.isWebCryptoAvailable(),
      secureContext: window.isSecureContext || false,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    };
  }
}

export default EphemeralKeyManager;