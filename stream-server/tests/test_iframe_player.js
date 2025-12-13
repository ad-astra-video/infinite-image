// Test script for iframe player functionality
const axios = require('axios');

const SERVER_URL = 'http://localhost:4021';

async function testIframePlayer() {
  console.log('Testing iframe player functionality...');
  
  try {
    // Test 1: Stream URL endpoint should include iframe_html field
    console.log('1. Testing stream URL endpoint includes iframe_html...');
    const streamResponse = await axios.get(`${SERVER_URL}/api/stream/url`);
    console.log('✅ Stream URL response:', JSON.stringify(streamResponse.data, null, 2));
    
    // Verify iframe_html field exists
    if (streamResponse.data.stream && 'iframe_html' in streamResponse.data.stream) {
      console.log('✅ iframe_html field is present in stream URL response');
    } else {
      console.log('❌ iframe_html field is missing from stream URL response');
    }
    
    // Test 2: Stream status endpoint should include iframe_html
    console.log('\n2. Testing stream status endpoint includes iframe_html...');
    const statusResponse = await axios.get(`${SERVER_URL}/api/stream/status`);
    console.log('✅ Stream status response:', JSON.stringify(statusResponse.data, null, 2));
    
    // Verify iframe_html field exists in status response
    if (statusResponse.data && 'iframe_html' in statusResponse.data) {
      console.log('✅ iframe_html field is present in stream status response');
    } else {
      console.log('❌ iframe_html field is missing from stream status response');
    }
    
    console.log('\n🎉 Iframe player tests completed!');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server not running. Start with: npm start');
    } else {
      console.log('❌ Test failed:', error.message);
      if (error.response) {
        console.log('Response data:', error.response.data);
        console.log('Response status:', error.response.status);
      }
    }
  }
}

if (require.main === module) {
  testIframePlayer();
}

module.exports = { testIframePlayer };