// Simple Socket.IO client test script
// Usage: NODE_ENV=development node socket_test.js
// Optionally set SERVER_URL env var, e.g. SERVER_URL=http://localhost:4021

const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4021';

console.log(`Attempting Socket.IO connection to ${SERVER_URL}`);

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 5000
});

socket.on('connect', () => {
  console.log('✅ Connected to server, socket id:', socket.id);
  // join public room for a quick smoke test
  socket.emit('join_chat', { room: 'public', userAddress: '0xtest', userType: 'public' });
});

socket.on('connect_error', (err) => {
  console.error('❌ connect_error:', err.message || err);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('ℹ️  disconnected:', reason);
  process.exit(0);
});

socket.on('chat_message', (msg) => {
  console.log('📨 chat_message:', msg);
});

// Keep the process alive for a short while to observe events
setTimeout(() => {
  console.log('Closing test socket');
  socket.close();
  process.exit(0);
}, 10000);
