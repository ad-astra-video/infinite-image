const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/ws';

console.log('Testing WebSocket connection to chat server...');

const ws = new WebSocket(serverUrl);

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');
  
  // Test joining public chat
  console.log('📝 Joining public chat...');
  ws.send(JSON.stringify({
    type: 'join_chat',
    room: 'public',
    userAddress: '0x1234567890123456789012345678901234567890',
    userType: 'public'
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    console.log('📨 Received message:', message);
    
    // If we got a join success, test sending a message
    if (message.type === 'join_success') {
      console.log('📤 Sending test message...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'Hello from WebSocket test!',
        messageType: 'public'
      }));
    }
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 WebSocket connection closed');
});

setTimeout(() => {
  console.log('⏰ Test completed, closing connection...');
  ws.close();
}, 5000);