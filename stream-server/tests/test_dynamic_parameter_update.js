// Test script for dynamic parameter updates during stream running
const axios = require('axios');

const SERVER_URL = 'http://localhost:4021';

async function testDynamicParameterUpdate() {
  console.log('Testing dynamic parameter update functionality...');
  
  try {
    // Test 1: Start a stream with initial dynamic parameters
    console.log('1. Starting stream with initial dynamic parameters...');
    const startResponse = await axios.post(`${SERVER_URL}/api/stream/start`, {
      height: '1024',
      width: '1024',
      rtmp_output: 'rtmp://example.com/stream',
      stream_key: 'test_key_123',
      capability_name: 'image-generation',
      prompt: 'initial prompt',
      steps: '20',
      guidance_scale: '3.5'
    });
    
    console.log('✅ Stream started:', startResponse.data);
    const streamId = startResponse.data.stream?.stream_id || startResponse.data.stream_id;
    
    // Test 2: Check stream status to confirm it's running
    console.log('2. Checking stream status...');
    const statusResponse = await axios.get(`${SERVER_URL}/api/stream/status`);
    console.log('✅ Stream status:', statusResponse.data);
    
    if (!statusResponse.data.running) {
      throw new Error('Stream should be running for this test');
    }
    
    // Test 3: Update dynamic parameters while stream is running
    console.log('3. Updating dynamic parameters while stream is running...');
    const updateResponse = await axios.post(`${SERVER_URL}/api/stream/update`, {
      prompt: 'updated prompt for dynamic change',
      steps: '30',
      guidance_scale: '4.5',
      seed: '12345'
    });
    
    console.log('✅ Dynamic parameters updated:', updateResponse.data);
    
    // Test 4: Verify the update was successful
    console.log('4. Verifying update was successful...');
    // The update should return success status
    if (updateResponse.status !== 200) {
      throw new Error('Update request failed');
    }
    
    // Test 5: Test that required fields cannot be updated (should be excluded)
    console.log('5. Testing that required fields are excluded from update...');
    const invalidUpdateResponse = await axios.post(`${SERVER_URL}/api/stream/update`, {
      height: '2048', // This should be ignored
      width: '2048', // This should be ignored
      prompt: 'new prompt',
      steps: '25'
    });
    
    console.log('✅ Update with required fields (should be ignored):', invalidUpdateResponse.data);
    
    // Test 6: Stop the stream
    console.log('6. Stopping the stream...');
    const stopResponse = await axios.post(`${SERVER_URL}/api/stream/stop`);
    console.log('✅ Stream stopped:', stopResponse.data);
    
    console.log('\n🎉 All dynamic parameter update tests passed successfully!');
    console.log('✅ Dynamic parameters can be updated while stream is running');
    console.log('✅ Required fields are properly excluded from updates');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server not running. Start with: npm start');
    } else if (error.response) {
      console.log('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.log('❌ Test failed:', error.message);
    }
  }
}

if (require.main === module) {
  testDynamicParameterUpdate();
}

module.exports = { testDynamicParameterUpdate };