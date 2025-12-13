const axios = require('axios');

/**
 * Test WHEP Connection Flow
 * Tests the complete WHEP connection implementation
 */
async function testWhepConnection() {
  console.log('🧪 Testing WHEP Connection Flow...\n');

  const baseUrl = 'http://localhost:4021';
  const testStreamId = 'test-stream-123';

  try {
    // Test 1: Check stream status endpoint
    console.log('1️⃣ Testing stream status endpoint...');
    const statusResponse = await axios.post(`${baseUrl}/api/stream/check-status`, {
      streamId: testStreamId
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Stream status endpoint working:', statusResponse.data);

    // Test 2: Setup WHEP connection
    console.log('\n2️⃣ Testing WHEP connection setup...');
    const whepResponse = await axios.post(`${baseUrl}/api/stream/setup-whep`, {
      streamId: testStreamId
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ WHEP connection setup response:', whepResponse.data);

    // Test 3: Check broadcasting status
    console.log('\n3️⃣ Testing broadcasting status...');
    const broadcastStatusResponse = await axios.get(`${baseUrl}/api/stream/status`);
    console.log('✅ Broadcasting status:', broadcastStatusResponse.data);

    console.log('\n🎉 All WHEP connection tests passed successfully!');
    return true;

  } catch (error) {
    console.error('❌ WHEP connection test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

// Run the test
if (require.main === module) {
  testWhepConnection().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testWhepConnection };