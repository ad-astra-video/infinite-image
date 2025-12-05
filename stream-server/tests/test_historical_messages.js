const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/ws';

console.log('🧪 Testing Historical Message System...');

// Test scenarios
async function runTest() {
  console.log('\n=== Test 1: Initial Connection and Message Storage ===');
  
  const ws1 = new WebSocket(serverUrl);
  
  return new Promise((resolve) => {
    ws1.on('open', () => {
      console.log('✅ Connected to WebSocket server');
      
      // Join public chat
      console.log('📝 Joining public chat...');
      ws1.send(JSON.stringify({
        type: 'join_chat',
        room: 'public',
        userAddress: '0xTestUser123456789012345678901234567890',
        userType: 'public',
        lastMessageTime: null  // First time joining
      }));
    });

    let messageCount = 0;
    
    ws1.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log('📨 Received message:', message.type, message.room || '');
        
        switch (message.type) {
          case 'join_success':
            console.log('📤 Sending test messages...');
            // Send multiple messages with delays to create timestamp differences
            setTimeout(() => {
              ws1.send(JSON.stringify({
                type: 'chat_message',
                room: 'public',
                message: 'Message 1 - First test message',
                messageType: 'public',
                userAddress: '0xTestUser123456789012345678901234567890'
              }));
            }, 100);
            
            setTimeout(() => {
              ws1.send(JSON.stringify({
                type: 'chat_message',
                room: 'public',
                message: 'Message 2 - Second test message',
                messageType: 'public',
                userAddress: '0xTestUser123456789012345678901234567890'
              }));
            }, 200);
            
            setTimeout(() => {
              ws1.send(JSON.stringify({
                type: 'chat_message',
                room: 'public',
                message: 'Message 3 - Third test message',
                messageType: 'public',
                userAddress: '0xTestUser123456789012345678901234567890'
              }));
            }, 300);
            break;
            
          case 'chat_message':
            messageCount++;
            console.log(`📝 Chat message ${messageCount}:`, message.content);
            
            if (messageCount === 3) {
              console.log('✅ All test messages sent, closing first connection...');
              setTimeout(() => {
                ws1.close();
              }, 500);
            }
            break;
            
          case 'historical_messages':
            console.log('🏛️ Historical messages received:', message.messages.length);
            message.messages.forEach((msg, index) => {
              console.log(`  ${index + 1}. ${msg.content} (${msg.timestamp})`);
            });
            resolve(message.messages.length);
            break;
        }
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
      }
    });

    ws1.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    ws1.on('close', () => {
      console.log('🔌 First connection closed');
      setTimeout(() => {
        console.log('\n=== Test 2: Reconnection with Historical Messages ===');
        testHistoricalRetrieval();
      }, 1000);
    });
  });
}

function testHistoricalRetrieval() {
  const ws2 = new WebSocket(serverUrl);
  
  ws2.on('open', () => {
    console.log('✅ Reconnected to WebSocket server');
    
    // Join with a timestamp from 1 second ago (should get all messages)
    const lastMessageTime = new Date(Date.now() - 1000).toISOString();
    console.log('📝 Joining with lastMessageTime:', lastMessageTime);
    
    ws2.send(JSON.stringify({
      type: 'join_chat',
      room: 'public',
      userAddress: '0xTestUser123456789012345678901234567890',
      userType: 'public',
      lastMessageTime: lastMessageTime
    }));
  });

  let historicalMessageCount = 0;
  
  ws2.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('📨 Received message:', message.type);
      
      switch (message.type) {
        case 'join_success':
          console.log('📤 Sending new message after reconnection...');
          ws2.send(JSON.stringify({
            type: 'chat_message',
            room: 'public',
            message: 'Message 4 - After reconnection',
            messageType: 'public',
            userAddress: '0xTestUser123456789012345678901234567890'
          }));
          break;
          
        case 'historical_messages':
          historicalMessageCount = message.messages.length;
          console.log('🏛️ Historical messages received:', historicalMessageCount);
          message.messages.forEach((msg, index) => {
            console.log(`  ${index + 1}. ${msg.content} (${msg.timestamp})`);
          });
          
          if (historicalMessageCount >= 3) {
            console.log('✅ Historical messages test passed!');
          } else {
            console.log('⚠️ Expected 3 historical messages, got:', historicalMessageCount);
          }
          break;
          
        case 'chat_message':
          console.log('📝 New message after reconnection:', message.content);
          console.log('🎉 Complete test finished!');
          setTimeout(() => {
            ws2.close();
          }, 500);
          break;
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  });

  ws2.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws2.on('close', () => {
    console.log('🔌 Second connection closed');
  });
}

// Run the test
console.log('🚀 Starting test...');
runTest().then((result) => {
  console.log('✅ Test completed successfully!');
}).catch((error) => {
  console.error('❌ Test failed:', error);
});

// Set timeout to prevent hanging
setTimeout(() => {
  console.log('⏰ Test timeout reached, exiting...');
  process.exit(0);
}, 30000);