const WebSocket = require('ws');

const serverUrl = 'ws://localhost:4021/chat';

console.log('🧪 Anonymous Rate Limit Test...');

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
      console.log('📤 Sending first message (should succeed)...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'First message from anonymous user',
        signature: '', // Blank signature for anonymous users
        counter: 1
      }));
    } else if (message.type === 'chat_message') {
      console.log('✅ First message succeeded');
      
      // Try to send second message immediately (should be rate limited)
      console.log('📤 Sending second message immediately (should be rate limited)...');
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: 'Second message immediately - should be blocked',
        signature: '', // Blank signature for anonymous users
        counter: 2
      }));
    } else if (message.type === 'error') {
      console.log('📨 Error message:', message);
      const errorText = message.error || message.message || '';
      if (errorText.includes('Rate limit')) {
        console.log('✅ Rate limiting working correctly:', errorText);
        
        // Wait for rate limit to expire and try again
        console.log('⏰ Waiting 65 seconds for rate limit to expire...');
        setTimeout(() => {
          console.log('📤 Sending message after rate limit expired...');
          ws.send(JSON.stringify({
            type: 'chat_message',
            room: 'public',
            message: 'Message after rate limit expired',
            signature: '', // Blank signature for anonymous users
            counter: 3
          }));
        }, 65000); // 65 seconds to be safe
        
      } else if (errorText.includes('delegation')) {
        console.log('❌ Signature validation failed for anonymous user (expected):', errorText);
        console.log('✅ Anonymous users should not require signature validation');
        
        // Try sending message without signature (for anonymous users)
        console.log('📤 Sending message without signature...');
        ws.send(JSON.stringify({
          type: 'chat_message',
          room: 'public',
          message: 'Message from anonymous user without signature',
          counter: 2
        }));
        
      } else if (errorText.includes('replay')) {
        console.log('✅ Replay protection working correctly:', errorText);
        console.log('✅ Anonymous rate limiting test completed successfully!');
        ws.close();
      } else {
        console.log('❌ Unexpected error:', errorText);
      }
    }
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed');
    process.exit(0);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });
}

test().catch(console.error);