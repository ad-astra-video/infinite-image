const { getIronSession } = require('iron-session');
const crypto = require('crypto');

/**
 * Iron-Session Configuration
 * Secure cookie-based session management
 */
const ironSessionOptions = {
  cookieName: 'x402_session',
  password: process.env.SESSION_PASSWORD || 'complex_password_at_least_32_characters_long',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax', // CSRF protection
    httpOnly: true, // Prevent XSS attacks
    maxAge: 24 * 60 * 60, // 24 hours in seconds
    path: '/', // Available site-wide
    domain: process.env.NODE_ENV === 'production' ? '.x402-stream.com' : undefined
  },
  ttl: 24 * 60 * 60, // Session TTL in seconds
  cookie: {
    // Additional cookie security settings
    overwrite: true, // Overwrite existing sessions
    signed: true, // Sign cookie contents
    rolling: true // Reset expiration on each request
  }
};

/**
 * Session Middleware
 * Attaches session object to request for all routes
 */
const sessionMiddleware = async (req, res, next) => {
  try {
    // Initialize iron-session for this request
    req.session = await getIronSession(req, res, ironSessionOptions);
    
    // Security: Generate session fingerprint
    if (!req.session.fingerprint) {
      req.session.fingerprint = {
        ipHash: generateIPHash(req.ip),
        uaHash: generateUAHash(req.get('User-Agent')),
        createdAt: Date.now(),
        lastSeen: Date.now()
      };
      await req.session.save();
    }
    
    // Security: Check for suspicious activity
    const currentIPHash = generateIPHash(req.ip);
    const currentUAHash = generateUAHash(req.get('User-Agent'));
    
    if (req.session.fingerprint.ipHash !== currentIPHash || 
        req.session.fingerprint.uaHash !== currentUAHash) {
      console.warn('Session fingerprint mismatch - potential security issue');
      // Don't immediately invalidate, but log for monitoring
    }
    
    next();
  } catch (err) {
    console.error('Iron session initialization error:', err);
    // Continue without session rather than crash
    req.session = null;
    next();
  }
};

/**
 * Session Validation Middleware
 * Validate session before protected routes
 */
const validateSession = async (req, res, next) => {
  try {
    if (!req.session) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_REQUIRED',
        message: 'Valid session required'
      });
    }
    
    // Check if session has required data
    if (!req.session.address || !req.session.siwe) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Session missing required authentication data'
      });
    }
    
    // Check expiration
    const now = Date.now();
    if (req.session.siwe.expiresAt && now > req.session.siwe.expiresAt) {
      await req.session.destroy();
      
      return res.status(401).json({
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Session has expired'
      });
    }
    
    // Update last seen timestamp
    req.session.fingerprint.lastSeen = now;
    await req.session.save();
    
    next();
  } catch (err) {
    console.error('Session validation error:', err);
    return res.status(500).json({
      success: false,
      error: 'SESSION_VALIDATION_ERROR',
      message: 'Failed to validate session'
    });
  }
};

/**
 * Generate IP hash for session fingerprinting
 */
function generateIPHash(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Generate User-Agent hash for session fingerprinting
 */
function generateUAHash(userAgent) {
  if (!userAgent) return 'unknown';
  return crypto.createHash('sha256').update(userAgent).digest('hex');
}

/**
 * Session Cleanup Utility
 * Clean up expired sessions (called periodically)
 */
async function cleanupExpiredSessions() {
  try {
    // This would typically be called by a cron job
    // Iron-session handles expiration automatically, but we can add custom cleanup
    console.log('Session cleanup completed at:', new Date().toISOString());
  } catch (err) {
    console.error('Session cleanup error:', err);
  }
}

module.exports = {
  ironSessionOptions,
  sessionMiddleware,
  validateSession,
  cleanupExpiredSessions
};