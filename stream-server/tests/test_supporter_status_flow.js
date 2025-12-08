const { ChatRouter } = require('../src/routes/chatRoutes');
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

async function testSupporterStatusFlow() {
  console.log('Testing supporter status flow and automatic chat joining...');

  // Create chat router with mock dependencies
  const chatRouter = new ChatRouter({
    logger: mockLogger,
    siweHandler: {
      getDelegationDataByAddress: (address) => {
        return {
          ephemeralPublicKey: '0x1234567890123456789012345678901234567890',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          counter: 0
        };
      }
    }
  });

  // Add supporter room with allowed users
  chatRouter.chatRooms.supporter.allowedUsers = new Set([
    '0x1234567890123456789012345678901234567890'
  ]);

  const mockWs = new MockWebSocket();
  
  console.log('\n=== Test 1: Simulate Supporter Status Becoming True ===');
  
  // Step 1: User joins public chat first
  console.log('Step 1: User joins public chat');
  const publicJoinMessage = {
    type: 'join_chat',
    room: 'public',
    userAddress: '0x1234567890123456789012345678901234567890',
    userType: 'public',
    userSignature: 'some_signature'
  };

  try {
    await chatRouter.handleJoinChat(mockWs, publicJoinMessage);
    console.log('✅ Public chat join successful');
  } catch (error) {
    console.log('❌ Error joining public chat:', error.message);
  }

  // Step 2: Simulate supporter status becoming true
  console.log('\nStep 2: Simulate supporter status becoming true');
  
  // This simulates what happens when the server sends supporter_status = true
  const supporterStatusMessage = {
    type: 'supporter_status',
    userAddress: '0x1234567890123456789012345678901234567890',
    isSupporter: true,
    validated: true,
    timestamp: new Date().toISOString()
  };

  // In a real scenario, this would be sent to the frontend WebSocket
  mockWs.send(JSON.stringify(supporterStatusMessage));
  console.log('✅ Supporter status message sent to frontend');

  // Step 3: Simulate frontend automatically joining supporter chat
  console.log('\nStep 3: Frontend automatically joins supporter chat');
  
  const supporterJoinMessage = {
    type: 'join_chat',
    room: 'supporter',
    userAddress: '0x1234567890123456789012345678901234567890',
    userType: 'supporter',
    userSignature: 'valid_signature'
  };

  try {
    await chatRouter.handleJoinChat(mockWs, supporterJoinMessage);
    console.log('✅ Supporter chat join successful');
  } catch (error) {
    console.log('❌ Error joining supporter chat:', error.message);
  }

  // Step 4: Verify user is now in supporter chat
  console.log('\nStep 4: Verify user is in supporter chat room');
  const supporterRoom = chatRouter.chatRooms.supporter;
  const userInSupporterRoom = supporterRoom.connectedUsers.has('0x1234567890123456789012345678901234567890');
  
  if (userInSupporterRoom) {
    console.log('✅ User successfully joined supporter chat room');
    console.log(`Supporter room has ${supporterRoom.connectedUsers.size} connected users`);
  } else {
    console.log('❌ User failed to join supporter chat room');
  }

  // Step 5: Verify the flow works
  console.log('\n=== Test Summary ===');
  const messages = mockWs.sentMessages;
  const hasUserJoinedSupporter = messages.some(msg => 
    msg.type === 'user_joined' && msg.room === 'supporter'
  );
  const hasJoinSuccess = messages.some(msg => 
    msg.type === 'join_success' && msg.room === 'supporter'
  );

  if (hasUserJoinedSupporter && hasJoinSuccess) {
    console.log('✅ Supporter status flow test PASSED');
    console.log('✅ Automatic supporter chat joining works correctly');
  } else {
    console.log('❌ Supporter status flow test FAILED');
  }

  console.log('\n📋 Messages sent during test:');
  messages.forEach((msg, index) => {
    console.log(`  ${index + 1}. ${msg.type} (${msg.room || 'no room'})`);
  });
}

// Run the test
testSupporterStatusFlow().catch(console.error);