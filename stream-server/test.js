// Test script for stream-server functionality
const axios = require('axios');

const SERVER_URL = 'http://localhost:4021';

async function testServer() {
  console.log('Testing stream-server functionality...');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);
    
    // Test super chat endpoint (should return empty array initially)
    console.log('2. Testing super chat endpoint...');
    const chatResponse = await axios.get(`${SERVER_URL}/api/super/chat`);
    console.log('✅ Super chat:', chatResponse.data);
    
    // Test tip endpoint
    console.log('3. Testing tip endpoint...');
    const tipResponse = await axios.post(`${SERVER_URL}/api/tip/1`, {
      msg: "Test message"
    });
    console.log('✅ Tip response:', tipResponse.data);
    
    // Test stream URL endpoint (should show not running)
    console.log('4. Testing stream URL endpoint...');
    const streamResponse = await axios.get(`${SERVER_URL}/stream/url`);
    console.log('✅ Stream URL:', streamResponse.data);
    
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server not running. Start with: npm start');
    } else {
      console.log('❌ Test failed:', error.message);
    }
  }
}

if (require.main === module) {
  testServer();
}

module.exports = { testServer };