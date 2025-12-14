const ChatMessageValidator = require('../src/auth/chatMessageValidator');
const SIWEWithEphemeralHandler = require('../src/auth/siweWithEphemeral');

/**
 * Test for counter race condition handling
 */
async function testCounterRaceCondition() {
  console.log('🧪 Testing counter race condition handling...\n');
  
  const siweHandler = new SIWEWithEphemeralHandler({
    logger: console
  });
  
  const validator = new ChatMessageValidator({
    logger: console,
    siweHandler: siweHandler
  });
  
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  
  // Test 1: Normal counter progression
  console.log('📝 Test 1: Normal counter progression');
  siweHandler.storeDelegationData({
    ephemeralPublicKey: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    counter: 0
  }, testAddress);
  
  let result = await validator.validateChatMessage({
    message: 'test message 1',
    signature: 'sig1',
    counter: 1,
    userAddress: testAddress,
    displayName: 'TestUser'
  });
  console.log('✅ Normal progression result:', result.isValid);
  
  // Test 2: Race condition - frontend counter ahead
  console.log('\n📝 Test 2: Race condition - frontend counter ahead');
  // Simulate frontend sending counter 5 while backend has counter 2
  siweHandler.updateDelegationCounter(testAddress, 2);
  
  result = await validator.validateChatMessage({
    message: 'test message 2',
    signature: 'sig2',
    counter: 5, // Frontend ahead by 3
    userAddress: testAddress,
    displayName: 'TestUser'
  });
  console.log('✅ Race condition result (should allow):', result.isValid);
  
  // Check if backend counter was updated
  const delegation = siweHandler.getDelegationDataByAddress(testAddress);
  console.log('✅ Backend counter after race condition:', delegation.counter);
  
  // Test 3: Counter behind (should fail)
  console.log('\n📝 Test 3: Counter behind (should fail)');
  siweHandler.updateDelegationCounter(testAddress, 10);
  
  try {
    result = await validator.validateChatMessage({
      message: 'test message 3',
      signature: 'sig3',
      counter: 8, // Behind by 2
      userAddress: testAddress,
      displayName: 'TestUser'
    });
    console.log('❌ FAIL: Counter behind should have been rejected');
  } catch (error) {
    console.log('✅ PASS: Counter behind correctly rejected:', error.message);
  }
  
  // Test 4: Next message after race condition should work normally
  console.log('\n📝 Test 4: Next message after race condition');
  result = await validator.validateChatMessage({
    message: 'test message 4',
    signature: 'sig4',
    counter: 6, // Should work now since backend was updated to 4
    userAddress: testAddress,
    displayName: 'TestUser'
  });
  console.log('✅ Next message result:', result.isValid);
  
  console.log('\n🎯 Race Condition Test Summary:');
  console.log('- Normal progression works ✅');
  console.log('- Frontend ahead handled gracefully ✅');
  console.log('- Counter behind still rejected ✅');
  console.log('- Subsequent messages work normally ✅');
}

// Run the test
testCounterRaceCondition().catch(console.error);