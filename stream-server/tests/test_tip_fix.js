// Test script to verify tip endpoint fix for hanging issue
const axios = require('axios');

const SERVER_URL = 'http://localhost:4021';

async function testTipEndpoints() {
  console.log('Testing tip endpoint fix for hanging issue...');
  
  try {
    // Test health endpoint first
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);
    
    // Test tip endpoint with fallback
    console.log('2. Testing tip endpoint with fallback...');
    const tipResponse = await axios.post(`${SERVER_URL}/api/tip/1/fallback`, {
      msg: "Test tip message - fallback route"
    }, {
      timeout: 5000 // 5 second timeout
    });
    console.log('✅ Tip response:', tipResponse.data);
    
    // Test regular tip endpoint (should work if payment middleware is working)
    console.log('3. Testing regular tip endpoint...');
    const regularTipResponse = await axios.post(`${SERVER_URL}/api/tip/1`, {
      msg: "Test tip message - regular route"
    }, {
      timeout: 15000 // 15 second timeout (longer to account for payment middleware)
    });
    console.log('✅ Regular tip response:', regularTipResponse.data);
    
    console.log('\n🎉 All tip endpoint tests passed successfully!');
    console.log('✅ Fix verified: Tip endpoints no longer hang');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server not running. Start with: npm start');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('❌ Request timed out - this indicates the hanging issue is still present');
    } else {
      console.log('❌ Test failed:', error.message);
      console.log('Error details:', error.response?.data || error.code);
    }
  }
}

if (require.main === module) {
  testTipEndpoints();
}

module.exports = { testTipEndpoints };