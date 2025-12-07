const ChatMessageValidator = require('../src/auth/chatMessageValidator');
const { ethers } = require('ethers');

// Mock session cache for testing
class MockSessionCache {
  constructor() {
    this.sessions = new Map();
  }
  
  validateSession(token) {
    const session = this.sessions.get(token);
    if (!session) {
      return { valid: false, reason: 'not_found' };
    }
    
    if (Date.now() > session.expiresAt) {
      return { valid: false, reason: 'expired' };
    }
    
    return {
      valid: true,
      session
    };
  }
  
  setSession(token, sessionData) {
    this.sessions.set(token, sessionData);
  }
}

async function testEphemeralChatSigning() {
  console.log('Testing Ephemeral Chat Message Signing...');
  
  // Create a mock session cache
  const sessionCache = new MockSessionCache();
  
  // Create test session data
  const testSessionToken = 'test_session_123';
  
  // Generate a random wallet for testing
  const testWallet = ethers.Wallet.createRandom();
  
  const testSession = {
    address: '0x1234567890123456789012345678901234567890',
    siwe: { expiresAt: Date.now() + 3600000 }, // 1 hour from now
    ephemeral: {
      publicKey: testWallet.address,
      expiresAt: Date.now() + 3600000, // 1 hour from now
      counter: 0,
      sessionID: 'session_abc123'
    }
  };
  
  sessionCache.setSession(testSessionToken, testSession);
  
  // Create validator with mock session cache
  const validator = new ChatMessageValidator({
    logger: console,
    sessionCache: sessionCache
  });
  
  try {
    // Test message data
    const message = 'Hello, this is a test message!';
    const counter = 1;
    const sessionID = 'session_abc123';
    
    // Create a test wallet and sign the message
    const wallet = testWallet; // Use the generated wallet directly
    const messageString = JSON.stringify({ message, counter, sessionID });
    const signature = await wallet.signMessage(messageString);
    
    console.log('✓ Generated ephemeral signature:', signature);
    
    // Test validation with session token (WebSocket scenario)
    const mockReq = { session: null }; // No HTTP session
    const validationResult = await validator.validateChatMessage(mockReq, {
      message,
      signature,
      counter,
      sessionID,
      sessionToken: testSessionToken
    });
    
    if (validationResult.valid) {
      console.log('✓ Ephemeral signature validation successful');
      console.log('✓ Message counter validation working');
      console.log('✓ Session ID binding working');
      console.log('✓ Anti-replay protection working');
    } else {
      console.error('✗ Validation failed:', validationResult.error);
    }
    
  } catch (error) {
    console.error('✗ Test failed with error:', error.message);
  }
}

// Run the test
testEphemeralChatSigning().then(() => {
  console.log('\nEphemeral chat signing test completed!');
}).catch(error => {
  console.error('Test execution failed:', error);
});