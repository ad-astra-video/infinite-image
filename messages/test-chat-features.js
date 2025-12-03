const axios = require('axios');
import { Wallet } from "ethers";

const wallet = Wallet.createRandom();
  
// Test configuration
const API_BASE = 'http://localhost:3001';
const TEST_PRIVATE_KEY = wallet.privateKey;

// Test data
const testAddress = '0x1234567890123456789012345678901234567890';
const testContent = 'Hello, this is a test message!';
const testTipAmount = 5;

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  details: []
};

// Helper function to log test results
function logTest(testName, success, message = '') {
  if (success) {
    testResults.passed++;
    console.log(`✅ ${testName}: PASSED ${message}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: FAILED ${message}`);
  }
  testResults.details.push({ testName, success, message });
}

// Initialize XMTP client for testing
async function initializeClient() {
  try {
    const response = await axios.post(`${API_BASE}/api/messages/initialize`, {
      privateKey: TEST_PRIVATE_KEY,
      options: {
        appName: 'x402-gateway-test',
        appVersion: '1.0.0'
      }
    });
    
    if (response.data.success) {
      logTest('XMTP Client Initialization', true, `Address: ${response.data.address}`);
      return response.data.address;
    } else {
      logTest('XMTP Client Initialization', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('XMTP Client Initialization', false, error.message);
    return null;
  }
}

// Test public chat functionality
async function testPublicChat() {
  console.log('\n🔓 Testing Public Chat...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/public-chat`, {
      content: testContent,
      metadata: {
        sender: testAddress,
        timestamp: new Date().toISOString(),
        testMode: true
      }
    });
    
    if (response.data.success) {
      logTest('Public Chat Message Send', true, `Message ID: ${response.data.result.messageId}`);
      return response.data.result;
    } else {
      logTest('Public Chat Message Send', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('Public Chat Message Send', false, error.message);
    return null;
  }
}

// Test DM functionality
async function testDM() {
  console.log('\n💬 Testing Direct Messages...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/dm`, {
      peerAddress: testAddress,
      content: `DM: ${testContent}`,
      metadata: {
        sender: testAddress,
        timestamp: new Date().toISOString(),
        testMode: true
      }
    });
    
    if (response.data.success) {
      logTest('DM Message Send', true, `Message ID: ${response.data.result.messageId}`);
      return response.data.result;
    } else {
      logTest('DM Message Send', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('DM Message Send', false, error.message);
    return null;
  }
}

// Test super chat functionality
async function testSuperChat() {
  console.log('\n👑 Testing Super Chat...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/super-chat`, {
      content: `Super Chat: ${testContent}`,
      tipAmount: testTipAmount,
      paymentVerification: {
        currency: 'USDC',
        amount: testTipAmount,
        verified: true,
        txHash: '0x' + '1234567890'.repeat(8) // Mock transaction hash
      }
    });
    
    if (response.data.success) {
      logTest('Super Chat Message Send', true, `Message ID: ${response.data.result.messageId}, Tip: $${testTipAmount}`);
      return response.data.result;
    } else {
      logTest('Super Chat Message Send', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('Super Chat Message Send', false, error.message);
    return null;
  }
}

// Test director chat functionality
async function testDirectorChat() {
  console.log('\n🛡️ Testing Director Chat...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/director-chat`, {
      content: `Director Chat: ${testContent}`,
      directorAuth: {
        directorId: testAddress,
        permissions: ['broadcast', 'moderate'],
        authenticated: true
      }
    });
    
    if (response.data.success) {
      logTest('Director Chat Message Send', true, `Message ID: ${response.data.result.messageId}`);
      return response.data.result;
    } else {
      logTest('Director Chat Message Send', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('Director Chat Message Send', false, error.message);
    return null;
  }
}

// Test message moderation
async function testMessageModeration() {
  console.log('\n⚖️ Testing Message Moderation...');
  
  // First send a message to moderate
  const messageResult = await testPublicChat();
  if (!messageResult) {
    logTest('Message Moderation Setup', false, 'Could not send test message to moderate');
    return;
  }
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/moderate`, {
      messageId: messageResult.messageId,
      action: 'approve',
      moderator: {
        address: testAddress,
        role: 'moderator'
      }
    });
    
    if (response.data.success) {
      logTest('Message Moderation', true, `Action: approve, Moderation ID: ${response.data.result.moderationId}`);
      return response.data.result;
    } else {
      logTest('Message Moderation', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('Message Moderation', false, error.message);
    return null;
  }
}

// Test API health checks
async function testHealthChecks() {
  console.log('\n💚 Testing Health Checks...');
  
  try {
    const healthResponse = await axios.get(`${API_BASE}/health`);
    if (healthResponse.status === 200) {
      logTest('Service Health Check', true, `Status: ${healthResponse.data.status}`);
    }
  } catch (error) {
    logTest('Service Health Check', false, error.message);
  }
  
  try {
    const xmtpHealthResponse = await axios.get(`${API_BASE}/api/messages/health`);
    if (xmtpHealthResponse.status === 200) {
      logTest('XMTP Health Check', true, `Status: ${xmtpHealthResponse.data.status}`);
    }
  } catch (error) {
    logTest('XMTP Health Check', false, error.message);
  }
}

// Test conversation management
async function testConversationManagement() {
  console.log('\n💬 Testing Conversation Management...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/messages/conversation`, {
      peerAddress: testAddress
    });
    
    if (response.data.success) {
      logTest('Conversation Creation', true, `Peer: ${response.data.conversation.peerAddress}`);
      return response.data.conversation;
    } else {
      logTest('Conversation Creation', false, response.data.message);
      return null;
    }
  } catch (error) {
    logTest('Conversation Creation', false, error.message);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting XMTP Chat Features Test Suite');
  console.log('=================================================');
  
  // Initialize client
  const clientAddress = await initializeClient();
  if (!clientAddress) {
    console.log('\n❌ Cannot proceed with tests - XMTP client initialization failed');
    return;
  }
  
  // Run feature tests
  await testHealthChecks();
  await testPublicChat();
  await testDM();
  await testSuperChat();
  await testDirectorChat();
  await testMessageModeration();
  await testConversationManagement();
  
  // Print summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${(testResults.passed / (testResults.passed + testResults.failed) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests Details:');
    testResults.details
      .filter(test => !test.success)
      .forEach(test => console.log(`   - ${test.testName}: ${test.message}`));
  }
  
  console.log('\n🎉 Test suite completed!');
}

// Export test functions for manual testing
module.exports = {
  runAllTests,
  initializeClient,
  testPublicChat,
  testDM,
  testSuperChat,
  testDirectorChat,
  testMessageModeration
};

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}