const { ChatRouter } = require('../src/routes/chatRoutes');
const { WebSocket } = require('ws');
const { ethers } = require('ethers');

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

async function testAutomaticSupporterChatJoin() {
  console.log('Testing automatic supporter chat joining when supporter_status becomes true...');

  // Generate a test wallet with ethers.js
  const wallet = ethers.Wallet.createRandom();
  const testAddress = wallet.address;
  const testEphemeralAddress = ethers.Wallet.createRandom().address;
  
  console.log('Generated test wallet:');
  console.log('  Address:', testAddress);
  console.log('  Ephemeral Address:', testEphemeralAddress);

  // Mock SIWE handler with delegation data
  const mockSiweHandler = {
    getDelegationDataByAddress: (address) => {
      // Return delegation data for any address that matches our test address
      if (address && address.toLowerCase() === testAddress.toLowerCase()) {
        return {
          ephemeralPublicKey: testEphemeralAddress,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          counter: 0
        };
      }
      return null;
    }
  };

  // Create chat router with mock dependencies
  const chatRouter = new ChatRouter({
    logger: mockLogger,
    siweHandler: mockSiweHandler
  });

  // Add supporter room with allowed users - use the generated address
  chatRouter.chatRooms.supporter.allowedUsers = new Set([
    testAddress.toLowerCase()
  ]);

  // Store original functions before mocking
  const originalVerifyMessage = require('ethers').verifyMessage;
  const originalVerifyEphemeralSignature = chatRouter.messageValidator.verifyEphemeralSignature;
  
  // Mock verifyMessage function (normally from ethers)
  require('ethers').verifyMessage = (message, signature) => {
    // Verify signatures created with our test wallet
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase();
    } catch (error) {
      throw new Error('Invalid signature');
    }
  };

  // Mock the verifyEphemeralSignature method in ChatMessageValidator
  chatRouter.messageValidator.verifyEphemeralSignature = (messageString, signature, publicKey) => {
    try {
      // For our test, we'll verify against the test wallet's address
      const recoveredAddress = ethers.verifyMessage(messageString, signature);
      return recoveredAddress.toLowerCase() === publicKey.toLowerCase();
    } catch (error) {
      return false;
    }
  };

  const mockWs = new MockWebSocket();
  
  // Step 1: Simulate user joining public chat first
  console.log('\nStep 1: User joins public chat');
  const publicJoinMessage = {
    type: 'join_chat',
    room: 'public',
    userAddress: testAddress,
    userType: 'public',
    userSignature: 'some_signature'  // Anonymous join doesn't need signature
  };

  try {
    await chatRouter.handleJoinChat(mockWs, publicJoinMessage);
    console.log('✅ Public chat join successful');
  } catch (error) {
    console.log('❌ Error joining public chat:', error.message);
  }

  // Step 2: Create proper supporter check message with valid signature
  console.log('\nStep 2: User checks supporter status with valid signature');
  const supporterCheckMessage = `supporter_check_${testAddress}`;
  const supporterSignature = await wallet.signMessage(supporterCheckMessage);
  
  const supporterCheckMessageData = {
    type: 'is_supporter',
    userAddress: testAddress,
    userSignature: supporterSignature
  };

  try {
    await chatRouter.handleIsSupporter(mockWs, supporterCheckMessageData);
    console.log('✅ Supporter status check successful');
  } catch (error) {
    console.log('❌ Error checking supporter status:', error.message);
  }

  // Step 3: Verify the response includes supporter status
  console.log('\nStep 3: Verify supporter status response');
  const supporterStatusResponse = mockWs.sentMessages.find(msg => msg.type === 'supporter_status');
  
  if (supporterStatusResponse && supporterStatusResponse.isSupporter === true) {
    console.log('✅ Correct supporter status response received');
    console.log('Response:', supporterStatusResponse);
  } else {
    console.log('❌ Incorrect or missing supporter status response');
    console.log('All messages sent:', mockWs.sentMessages);
  }

  // Step 4: Simulate frontend receiving supporter_status and automatically joining supporter chat
  console.log('\nStep 4: Simulate automatic supporter chat joining (frontend behavior)');
  
  // This simulates what the frontend should do when it receives the supporter_status message
  const supporterJoinMessage = {
    type: 'join_chat',
    room: 'supporter',
    userAddress: testAddress,
    userType: 'supporter',
    userSignature: supporterSignature
  };

  try {
    await chatRouter.handleJoinChat(mockWs, supporterJoinMessage);
    console.log('✅ Supporter chat join successful');
  } catch (error) {
    console.log('❌ Error joining supporter chat:', error.message);
  }

  // Step 5: Verify user is now in supporter chat
  console.log('\nStep 5: Verify user is in supporter chat room');
  const supporterRoom = chatRouter.chatRooms.supporter;
  const userInSupporterRoom = supporterRoom.connectedUsers.has(testAddress);
  
  if (userInSupporterRoom) {
    console.log('✅ User successfully joined supporter chat room');
    console.log(`Supporter room has ${supporterRoom.connectedUsers.size} connected users`);
  } else {
    console.log('❌ User failed to join supporter chat room');
  }

  // Restore original verifyMessage function
  require('ethers').verifyMessage = originalVerifyMessage;
  
  // Restore original verifyEphemeralSignature method
  chatRouter.messageValidator.verifyEphemeralSignature = originalVerifyEphemeralSignature;
  
  console.log('\n✅ Automatic supporter chat join test completed');
}

// Run the test
testAutomaticSupporterChatJoin().catch(console.error);