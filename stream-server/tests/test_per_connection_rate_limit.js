const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/chat';

console.log('🧪 Per-Connection Anonymous Rate Limit Test...');

async function testMultipleConnections() {
  console.log('📡 Creating multiple anonymous connections...');
  
  // Create multiple WebSocket connections to test per-connection rate limiting
  const connections = [];
  const numConnections = 3;
  
  for (let i = 0; i < numConnections; i++) {
    const ws = new WebSocket(serverUrl);
    connections.push(ws);
    
    ws.on('open', () => {
      console.log(`✅ Connection ${i + 1} connected`);
      
      // Join public chat as anonymous user
      ws.send(JSON.stringify({
        type: 'join_chat',
        room: 'public',
        userAddress: 'anon',
        userType: 'public',
        lastMessageTime: null
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      console.log(`📨 Connection ${i + 1} - Message:`, message.type);
      
      if (message.type === 'join_success') {
        console.log(`📤 Connection ${i + 1} - Sending first message...`);
        ws.send(JSON.stringify({
          type: 'chat_message',
          room: 'public',
          message: `Message ${i + 1} from anonymous connection`,
          signature: 'none',
          counter: 1
        }));
      } else if (message.type === 'chat_message') {
        console.log(`✅ Connection ${i + 1} - First message succeeded`);
        
        // Try to send second message immediately (should be rate limited for this connection)
        setTimeout(() => {
          console.log(`📤 Connection ${i + 1} - Sending second message (should be rate limited)...`);
          ws.send(JSON.stringify({
            type: 'chat_message',
            room: 'public',
            message: `Second message ${i + 1} - should be rate limited`,
            signature: 'none',
            counter: 2
          }));
        }, 1000); // 1 second delay to see rate limiting
      } else if (message.type === 'rate_limit') {
        console.log(`❌ Connection ${i + 1} - Rate limited:`, message.nextMessageTime);
      }
    });

    ws.on('close', () => {
      console.log(`🔌 Connection ${i + 1} closed`);
    });

    ws.on('error', (error) => {
      console.error(`❌ Connection ${i + 1} error:`, error);
    });
  }

  // Wait for all connections to complete their tests
  setTimeout(() => {
    console.log('🏁 Test completed - closing all connections');
    connections.forEach(ws => ws.close());
    process.exit(0);
  }, 10000); // 10 seconds to complete all tests
}

testMultipleConnections().catch(console.error);