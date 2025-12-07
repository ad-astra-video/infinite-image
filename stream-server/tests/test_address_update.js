const WebSocket = require('ws');
const { ChatRouter } = require('../src/routes/chatRoutes');

// Mock logger
const mockLogger = {
  info: (msg) => console.log('INFO:', msg),
  error: (msg) => console.error('ERROR:', msg),
  warn: (msg) => console.warn('WARN:', msg)
};

// Mock SIWE handler with delegation data
const mockSiweHandler = {
  getDelegationDataByAddress: (address) => {
    if (address.toLowerCase() === '0x1234567890123456789012345678901234567890') {
      return {
        ephemeralPublicKey: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        originalAddress: address.toLowerCase()
      };
    }
    return null;
  }
};

// Mock message validator
const mockMessageValidator = {
  validateChatMessage: async (params) => {
    return {
      isValid: true,
      address: params.userAddress,
      validated: true
    };
  }
};

async function testAddressUpdate() {
  console.log('Testing address update functionality...');
  
  // Create chat router with mocks
  const chatRouter = new ChatRouter({
    logger: mockLogger,
    messageValidator: mockMessageValidator,
    siweHandler: mockSiweHandler
  });
  
  // Create mock WebSocket connection
  const mockWs = {
    userData: {
      address: 'anon',
      validated: false,
      displayName: 'anonymous',
      room: 'public'
    },
    send: (data) => {
      const message = JSON.parse(data);
      console.log('Mock WS sent:', message.type, message);
    }
  };
  
  // Create mock server for WebSocket initialization
  const mockServer = {};
  
  // Initialize WebSocket server
  chatRouter.initializeWebSocketServer(mockServer);
  
  // Simulate connection
  chatRouter.handleWebSocketConnection(mockWs);
  
  // Simulate joining chat with anonymous address
  const joinMessage = {
    type: 'join_chat',
    room: 'public',
    userAddress: 'anon',
    userType: 'public',
    userSignature: '',
    lastMessageTime: null
  };
  
  await chatRouter.handleJoinChat(mockWs, joinMessage);
  
  console.log('Initial userData:', mockWs.userData);
  
  // Now simulate sending is_supporter message with valid address and signature
  const supporterMessage = {
    type: 'is_supporter',
    userAddress: '0x1234567890123456789012345678901234567890',
    userSignature: '0xsignature1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234'
  };
  
  await chatRouter.handleIsSupporter(mockWs, supporterMessage);
  
  console.log('Updated userData:', mockWs.userData);
  
  // Verify the address was updated
  if (mockWs.userData.address === '0x1234567890123456789012345678901234567890') {
    console.log('✅ SUCCESS: Address was updated successfully');
    console.log('✅ Address:', mockWs.userData.address);
    console.log('✅ Validated:', mockWs.userData.validated);
    console.log('✅ Display Name:', mockWs.userData.displayName);
    console.log('✅ Has delegation data:', !!mockWs.userData.delegation);
  } else {
    console.log('❌ FAILED: Address was not updated');
    console.log('Expected: 0x1234567890123456789012345678901234567890');
    console.log('Got:', mockWs.userData.address);
  }
  
  console.log('Test completed.');
}

// Run the test
testAddressUpdate().catch(console.error);