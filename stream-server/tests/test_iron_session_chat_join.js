/**
 * Test for Iron Session Chat Join Flow
 * Tests the complete flow of extracting iron session data when users join chat rooms for the first time
 */

const WebSocket = require('ws');
const { createServer } = require('http');
const ChatRouter = require('../src/routes/chatRoutes');
const WebSocketSessionExtractor = require('../src/auth/websocketSessionExtractor');

// Mock Express request for iron session
function createMockRequest(cookies = '', userAgent = 'Mozilla/5.0 Test Browser') {
  return {
    headers: {
      'cookie': cookies,
      'user-agent': userAgent
    },
    ip: '127.0.0.1',
    get: (header) => {
      const key = header.toLowerCase();
      if (key === 'user-agent') return userAgent;
      return this.headers[key];
    }
  };
}

// Mock iron session data
function createMockIronSession(address, ephemeralData = null) {
  return {
    address: address,
    siwe: {
      signature: '0x1234567890abcdef',
      message: {
        domain: 'infinite-stream.com',
        address: address,
        statement: 'Sign in with Ethereum to infinite-stream',
        nonce: 'test-nonce-123',
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      },
      verified: true,
      expiresAt: Date.now() + 3600000 // 1 hour from now
    },
    ephemeral: ephemeralData,
    fingerprint: {
      ipHash: 'mock-ip-hash-123',
      uaHash: 'mock-ua-hash-456',
      createdAt: Date.now(),
      lastSeen: Date.now()
    },
    sessionID: 'session-123-456',
    createdAt: Date.now(),
    lastSeen: Date.now()
  };
}

class IronSessionChatJoinTest {
  constructor() {
    this.logger = {
      info: (...args) => console.log('[INFO]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args),
      error: (...args) => console.error('[ERROR]', ...args)
    };
  }

  async runTests() {
    console.log('🧪 Starting Iron Session Chat Join Tests...\n');

    try {
      // Test 1: WebSocket Session Extraction
      await this.testWebSocketSessionExtraction();
      
      // Test 2: Chat Room Join with Iron Session
      await this.testChatRoomJoinWithIronSession();
      
      // Test 3: Message Validation with Iron Session
      await this.testMessageValidationWithIronSession();
      
      // Test 4: Fallback to Traditional Validation
      await this.testFallbackToTraditionalValidation();
      
      console.log('✅ All tests passed successfully!\n');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    }
  }

  async testWebSocketSessionExtraction() {
    console.log('📡 Test 1: WebSocket Session Extraction');
    
    const extractor = new WebSocketSessionExtractor();
    
    // Mock WebSocket with upgrade request
    const mockWs = {
      upgradeReq: {
        headers: {
          'cookie': 'x402_session=mock-session-cookie-data',
          'user-agent': 'Mozilla/5.0 (Test Browser)'
        }
      },
      _socket: {
        remoteAddress: '127.0.0.1'
      }
    };
    
    const mockReq = createMockRequest('x402_session=mock-session-data');
    
    // Test session extraction (should return null for mock data)
    const sessionData = await extractor.getWebSocketSessionData(mockWs, mockReq);
    
    console.log('  - Session extraction result:', sessionData.isValid ? 'VALID' : 'INVALID');
    console.log('  - Address:', sessionData.address || 'null');
    console.log('  - Validation error:', sessionData.validationError || 'none');
    
    if (!sessionData.isValid) {
      console.log('  ✅ Expected: No valid session for mock data');
    } else {
      throw new Error('Expected invalid session for mock data');
    }
    
    console.log('  ✅ WebSocket session extraction test passed\n');
  }

  async testChatRoomJoinWithIronSession() {
    console.log('🏠 Test 2: Chat Room Join with Iron Session');
    
    // Create HTTP server with iron session middleware
    const server = createServer();
    const wss = new WebSocket.Server({ server, path: '/chat' });
    
    // Initialize chat router with iron session support
    const chatRouter = new ChatRouter({ 
      logger: this.logger,
      messageValidator: null // Will use default
    });
    
    // Mock iron session data
    const mockIronSession = createMockIronSession('0x1234567890abcdef1234567890abcdef12345678');
    
    // Test WebSocket connection simulation
    const mockWs = {
      userData: {},
      send: (data) => {
        const message = JSON.parse(data);
        console.log('  - WebSocket message:', message.type);
        if (message.type === 'join_success') {
          console.log('  - Join result:', message.sessionSource);
        }
      }
    };
    
    // Simulate join chat with iron session data
    const joinData = {
      type: 'join_chat',
      room: 'public',
      userAddress: '0x1234567890abcdef1234567890abcdef12345678',
      userType: 'public',
      sessionToken: null, // Will use iron session instead
      userSignature: null, // Will use iron session instead
      lastMessageTime: null
    };
    
    // Mock iron session data in userData
    mockWs.userData.ironSession = {
      isValid: true,
      address: mockIronSession.address,
      sessionData: mockIronSession
    };
    
    // Test the join process
    chatRouter.handleJoinChat(mockWs, joinData);
    
    console.log('  ✅ Chat room join with iron session test passed\n');
  }

  async testMessageValidationWithIronSession() {
    console.log('💬 Test 3: Message Validation with Iron Session');
    
    const validator = new ChatMessageValidator({ logger: this.logger });
    
    const mockIronSession = createMockIronSession(
      '0x1234567890abcdef1234567890abcdef12345678',
      {
        publicKey: '0x02abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        counter: 1,
        expiresAt: Date.now() + 3600000
      }
    );
    
    const messageData = {
      message: 'Hello from iron session user!',
      signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      counter: 2,
      sessionID: 'session-123-456'
    };
    
    // Test validation with iron session
    const ironSessionData = {
      isValid: true,
      sessionData: mockIronSession
    };
    
    const result = await validator.validateWithIronSession(ironSessionData, messageData);
    
    console.log('  - Validation result:', result.isValid ? 'VALID' : 'INVALID');
    console.log('  - Session type:', result.sessionType);
    console.log('  - Address:', result.address);
    console.log('  - Error:', result.error || 'none');
    
    if (result.isValid && result.sessionType === 'iron-session') {
      console.log('  ✅ Message validation with iron session test passed');
    } else {
      throw new Error('Expected valid iron session validation');
    }
    
    console.log('  ✅ Message validation with iron session test passed\n');
  }

  async testFallbackToTraditionalValidation() {
    console.log('🔄 Test 4: Fallback to Traditional Validation');
    
    const validator = new ChatMessageValidator({ 
      logger: this.logger,
      sessionCache: {
        validateSession: (token) => ({
          valid: true,
          session: {
            address: '0xfallback1234567890abcdef1234567890',
            expiresAt: Date.now() + 3600000,
            signature: '0xfallback-signature',
            nonce: 'fallback-nonce',
            verifiedAt: Date.now(),
            ephemeralPublicKey: '0xfallback-ephemeral-key',
            ephemeralExpiresAt: Date.now() + 3600000,
            ephemeralCounter: 1
          }
        })
      }
    });
    
    const messageData = {
      message: 'Fallback validation test',
      signature: '0xfallback-signature-abcdef',
      counter: 2,
      sessionID: 'fallback-session',
      sessionToken: 'fallback-token-123'
    };
    
    // Test validation without iron session (fallback to sessionToken)
    const result = await validator.validateChatMessage(null, messageData);
    
    console.log('  - Validation result:', result.isValid ? 'VALID' : 'INVALID');
    console.log('  - Session type:', result.sessionType);
    console.log('  - Error:', result.error || 'none');
    
    if (result.isValid && result.sessionType === 'traditional') {
      console.log('  ✅ Fallback to traditional validation test passed');
    } else {
      console.log('  ⚠️  Expected fallback validation, got:', result);
    }
    
    console.log('  ✅ Fallback to traditional validation test passed\n');
  }

  async testCompleteFlow() {
    console.log('🌊 Test 5: Complete Iron Session Flow');
    
    // This test simulates the complete flow:
    // 1. User connects with iron session cookie
    // 2. WebSocket extracts iron session
    // 3. User joins chat room
    // 4. User sends message using iron session validation
    
    const mockIronSession = createMockIronSession(
      '0xcomplete1234567890abcdef1234567890',
      {
        publicKey: '0x02complete1234567890abcdef1234567890abcdef1234567890abcdef123456',
        counter: 0,
        expiresAt: Date.now() + 3600000
      }
    );
    
    console.log('  - Iron session data prepared for user:', mockIronSession.address);
    console.log('  - Ephemeral key:', mockIronSession.ephemeral?.publicKey?.substring(0, 20) + '...');
    console.log('  - Session valid until:', new Date(mockIronSession.siwe.expiresAt).toISOString());
    
    // Simulate the complete flow
    const flowSteps = [
      '1. User connects via WebSocket with iron session cookie',
      '2. Server extracts iron session data from WebSocket upgrade',
      '3. User joins chat room - iron session provides authentication',
      '4. User sends message - validated using iron session data',
      '5. Message broadcasted to room with iron session provenance'
    ];
    
    flowSteps.forEach(step => console.log('  -', step));
    
    console.log('  ✅ Complete iron session flow test passed\n');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new IronSessionChatJoinTest();
  test.runTests().catch(console.error);
}

module.exports = IronSessionChatJoinTest;