const ChatRouter = require('../src/routes/chatRoutes');
const { WebSocket } = require('ws');

// Mock WebSocket for testing
class MockWebSocket {
  constructor() {
    this.readyState = WebSocket.OPEN;
    this.userData = {};
    this.sentMessages = [];
  }

  send(message) {
    this.sentMessages.push(JSON.parse(message));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {}
};

// Mock SIWE handler with delegation data
const mockSiweHandler = {
  getDelegationDataByAddress: (address) => {
    if (address === '0x1234567890123456789012345678901234567890') {
      return {
        ephemeralPublicKey: '0x9876543210987654321098765432109876543210',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        counter: 0
      };
    }
    return null;
  }
};

async function testIsSupporterFunctionality() {
  console.log('Testing is_supporter message functionality...');

  // Create chat router with mock dependencies
  const chatRouter = new ChatRouter({
    logger: mockLogger,
    siweHandler: mockSiweHandler
  });

  // Add supporter room with allowed users
  chatRouter.chatRooms.supporter.allowedUsers = new Set([
    '0x1234567890123456789012345678901234567890'
  ]);

  // Test 1: Valid supporter request
  console.log('\nTest 1: Valid supporter request with proper signature');
  
  const mockWs1 = new MockWebSocket();
  
  // Mock verifyMessage function (normally from ethers)
  const originalVerifyMessage = require('ethers').utils.verifyMessage;
  require('ethers').utils.verifyMessage = (message, signature) => {
    if (message === 'supporter_check_0x1234567890123456789012345678901234567890') {
      return '0x9876543210987654321098765432109876543210';
    }
    throw new Error('Invalid signature');
  };

  const validMessage = {
    type: 'is_supporter',
    userAddress: '0x1234567890123456789012345678901234567890',
    userSignature: 'valid_signature'
  };

  try {
    await chatRouter.handleIsSupporter(mockWs1, validMessage);
    console.log('✅ Valid supporter request processed successfully');
  } catch (error) {
    console.log('❌ Error processing valid supporter request:', error.message);
  }

  // Check response
  const response1 = mockWs1.sentMessages.find(msg => msg.type === 'supporter_status');
  if (response1 && response1.isSupporter === true) {
    console.log('✅ Correct supporter status returned for valid user');
  } else {
    console.log('❌ Incorrect or missing supporter status response');
  }

  // Test 2: Invalid supporter request (no delegation)
  console.log('\nTest 2: Invalid supporter request (no delegation)');
  
  const mockWs2 = new MockWebSocket();
  
  const invalidMessage = {
    type: 'is_supporter',
    userAddress: '0x0000000000000000000000000000000000000000',
    userSignature: 'some_signature'
  };

  try {
    await chatRouter.handleIsSupporter(mockWs2, invalidMessage);
    console.log('❌ Should have failed for invalid delegation');
  } catch (error) {
    console.log('✅ Correctly rejected invalid delegation:', error.message);
  }

  // Check error response
  const errorResponse = mockWs2.sentMessages.find(msg => msg.type === 'error');
  if (errorResponse && errorResponse.error.includes('delegation')) {
    console.log('✅ Correct error message for missing delegation');
  } else {
    console.log('❌ Incorrect error handling for missing delegation');
  }

  // Test 3: Missing required fields
  console.log('\nTest 3: Missing required fields');
  
  const mockWs3 = new MockWebSocket();
  
  const incompleteMessage = {
    type: 'is_supporter',
    userAddress: '0x1234567890123456789012345678901234567890'
    // Missing userSignature
  };

  try {
    await chatRouter.handleIsSupporter(mockWs3, incompleteMessage);
    console.log('❌ Should have failed for missing fields');
  } catch (error) {
    console.log('✅ Correctly rejected missing fields:', error.message);
  }

  // Check error response
  const errorResponse3 = mockWs3.sentMessages.find(msg => msg.type === 'error');
  if (errorResponse3 && errorResponse3.error.includes('required fields')) {
    console.log('✅ Correct error message for missing fields');
  } else {
    console.log('❌ Incorrect error handling for missing fields');
  }

  // Restore original function
  require('ethers').utils.verifyMessage = originalVerifyMessage;

  console.log('\n✅ is_supporter functionality test completed');
}

if (require.main === module) {
  testIsSupporterFunctionality()
    .then(() => {
      console.log('\n🎉 All is_supporter tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testIsSupporterFunctionality };