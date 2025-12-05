/**
 * SIWE Cache Utility for Frontend
 * Handles session token caching and validation status management
 */

const SIWE_CACHE_KEY = 'siwe_session';
const SIWE_CACHE_VERSION = '1.0.0';

class SIWECache {
  constructor() {
    this.cache = this.loadCache();
  }

  /**
   * Load cache from localStorage
   * @returns {object|null} Cached session data
   */
  loadCache() {
    try {
      const cached = localStorage.getItem(SIWE_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        
        // Check cache version
        if (data.version !== SIWE_CACHE_VERSION) {
          this.clearCache();
          return null;
        }

        // Check expiration
        if (Date.now() > data.expiresAt) {
          this.clearCache();
          return null;
        }

        return data;
      }
    } catch (error) {
      console.warn('Failed to load SIWE cache:', error);
      this.clearCache();
    }
    return null;
  }

  /**
   * Cache session token and validation data
   * @param {object} sessionData - Session data to cache
   */
  cacheSession(sessionData) {
    try {
      const cacheData = {
        version: SIWE_CACHE_VERSION,
        token: sessionData.token,
        address: sessionData.address,
        validated: true,
        expiresAt: sessionData.expiresAt,
        timestamp: Date.now(),
        ...sessionData
      };

      localStorage.setItem(SIWE_CACHE_KEY, JSON.stringify(cacheData));
      this.cache = cacheData;
      console.log('SIWE session cached successfully');
    } catch (error) {
      console.error('Failed to cache SIWE session:', error);
    }
  }

  /**
   * Check if user has valid cached session
   * @param {string} currentAddress - Current wallet address
   * @returns {object} Validation status
   */
  isValidSession(currentAddress) {
    const cache = this.loadCache();
    
    if (!cache) {
      return { valid: false, reason: 'no_cache' };
    }

    // Check if cache matches current wallet address
    if (cache.address && currentAddress && 
        cache.address.toLowerCase() !== currentAddress.toLowerCase()) {
      return { valid: false, reason: 'address_mismatch' };
    }

    // Check expiration
    if (Date.now() > cache.expiresAt) {
      this.clearCache();
      return { valid: false, reason: 'expired' };
    }

    return {
      valid: true,
      token: cache.token,
      address: cache.address,
      signature: cache.signature,
      expiresAt: cache.expiresAt,
      cached: true
    };
  }

  /**
   * Get cached session token
   * @returns {string|null} Session token
   */
  getSessionToken() {
    const cache = this.loadCache();
    return cache ? cache.token : null;
  }

  /**
   * Get cached validation status
   * @returns {object|null} Validation status
   */
  getValidationStatus() {
    const cache = this.loadCache();
    return cache ? {
      validated: cache.validated,
      address: cache.address,
      expiresAt: cache.expiresAt,
      cached: true
    } : null;
  }

  /**
   * Clear SIWE cache
   */
  clearCache() {
    localStorage.removeItem(SIWE_CACHE_KEY);
    this.cache = null;
    console.log('SIWE cache cleared');
  }

  /**
   * Check cache expiration and clean if needed
   */
  checkExpiration() {
    const cache = this.loadCache();
    if (cache && Date.now() > cache.expiresAt) {
      this.clearCache();
      return { valid: false, reason: 'expired' };
    }
    return cache ? { valid: true, ...cache } : { valid: false, reason: 'no_cache' };
  }

  /**
   * Get cache statistics for debugging
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    const cache = this.loadCache();
    if (!cache) {
      return {
        hasCache: false,
        valid: false,
        reason: 'no_cache'
      };
    }

    return {
      hasCache: true,
      valid: Date.now() < cache.expiresAt,
      address: cache.address,
      expiresAt: cache.expiresAt,
      timeRemaining: Math.max(0, cache.expiresAt - Date.now()),
      cached: true
    };
  }

  /**
   * Handle wallet disconnect - clear cache
   */
  handleWalletDisconnect() {
    this.clearCache();
  }

  /**
   * Handle wallet address change - clear cache
   */
  handleAddressChange(newAddress) {
    const cache = this.loadCache();
    if (cache && cache.address && 
        cache.address.toLowerCase() !== newAddress.toLowerCase()) {
      this.clearCache();
    }
  }
}

// Export singleton instance
const siweCache = new SIWECache();

export default siweCache;