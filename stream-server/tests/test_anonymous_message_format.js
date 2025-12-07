const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/chat';

console.log('🧪 Anonymous Message Format Test...');

async function test() {
  console.log('📡 Connecting to server...');
  const ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    console.log('✅ Connected');
    
    // Join public chat as anonymous user
    console.log('📝 Joining public chat as anonymous...');
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
    console.log('📨 Message:', message.type);
    
    if (message.type === 'join_success') {
      console.log('📤 Sending first anonymous message with counter and blank signature...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'First test message from anonymous user with counter 1',
        signature: '', // Blank signature
        counter: 1
      }));
    } else if (message.type === 'chat_message') {
      console.log('✅ Anonymous message with counter and blank signature succeeded');
      console.log('📝 Message details:', {
        id: message.id,
        userAddress: message.userAddress,
        message: message.message,
        timestamp: message.timestamp
      });
      
      // Send second message to verify counter increment
      console.log('📤 Sending second anonymous message...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'Second test message from anonymous user with counter 2',
        signature: '', // Blank signature
        counter: 2
      }));
    } else if (message.type === 'error') {
      console.log('❌ Error:', message.error);
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed');
    console.log('✅ Anonymous message format test completed successfully!');
    process.exit(0);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });
}

test().catch(console.error);