const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/ws';

console.log('🧪 Simple Historical Message Test...');

async function test() {
  console.log('📡 Connecting to server...');
  const ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    console.log('✅ Connected');
    
    // Join public chat with no lastMessageTime
    console.log('📝 Joining public chat (first time)...');
    ws.send(JSON.stringify({
      type: 'join_chat',
      room: 'public',
      userAddress: '0xTestUser1',
      userType: 'public',
      lastMessageTime: null
    }));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('📨 Message:', message.type);
    
    if (message.type === 'join_success') {
      console.log('📤 Sending test message...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'Hello from test!',
        messageType: 'public',
        userAddress: '0xTestUser1'
      }));
    } else if (message.type === 'chat_message') {
      console.log('📝 Got chat message, closing connection...');
      setTimeout(() => ws.close(), 500);
    } else if (message.type === 'historical_messages') {
      console.log('🏛️ Got historical messages:', message.messages.length);
      message.messages.forEach(msg => {
        console.log(`  - ${msg.content} (${msg.timestamp})`);
      });
      setTimeout(() => ws.close(), 500);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed, testing rejoin...');
    setTimeout(() => testRejoin(), 1000);
  });

  ws.on('error', (error) => {
    console.error('❌ Error:', error);
  });
}

function testRejoin() {
  console.log('📡 Reconnecting...');
  const ws2 = new WebSocket(serverUrl);

  ws2.on('open', () => {
    console.log('✅ Reconnected');
    
    // Join with timestamp from 2 seconds ago
    const lastMessageTime = new Date(Date.now() - 2000).toISOString();
    console.log('📝 Rejoining with lastMessageTime:', lastMessageTime);
    
    ws2.send(JSON.stringify({
      type: 'join_chat',
      room: 'public',
      userAddress: '0xTestUser2',
      userType: 'public',
      lastMessageTime: lastMessageTime
    }));
  });

  ws2.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('📨 Message:', message.type);
    
    if (message.type === 'historical_messages') {
      console.log('🏛️ Got historical messages:', message.messages.length);
      message.messages.forEach(msg => {
        console.log(`  - ${msg.content} (${msg.timestamp})`);
      });
      console.log('✅ Test completed!');
      setTimeout(() => ws2.close(), 500);
    }
  });

  ws2.on('close', () => {
    console.log('🔌 Reconnection test finished');
  });

  ws2.on('error', (error) => {
    console.error('❌ Error:', error);
  });
}

test();