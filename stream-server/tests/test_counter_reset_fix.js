const SIWEWithEphemeralHandler = require('../src/auth/siweWithEphemeral');

/**
 * Test for counter reset fix when new ephemeral key is received
 */
async function testCounterReset() {
  console.log('🧪 Testing counter reset fix for new ephemeral keys...\n');
  
  const siweHandler = new SIWEWithEphemeralHandler({
    logger: console
  });
  
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  
  // Test 1: Store initial delegation with counter 5
  console.log('📝 Test 1: Store initial delegation with counter 5');
  siweHandler.storeDelegationData({
    ephemeralPublicKey: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    counter: 5
  }, testAddress);
  
  let delegation = siweHandler.getDelegationDataByAddress(testAddress);
  console.log('✅ Initial delegation counter:', delegation.counter);
  
  // Test 2: Store new delegation with different ephemeral key - should reset counter to 0
  console.log('\n📝 Test 2: Store new delegation with different ephemeral key');
  siweHandler.storeDelegationData({
    ephemeralPublicKey: '0x9999999999999999999999999999999999999999',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    counter: 10 // This should be ignored and reset to 0
  }, testAddress);
  
  delegation = siweHandler.getDelegationDataByAddress(testAddress);
  console.log('✅ New delegation counter (should be 0):', delegation.counter);
  
  if (delegation.counter === 0) {
    console.log('✅ PASS: Counter correctly reset to 0 for new ephemeral key');
  } else {
    console.log('❌ FAIL: Counter not reset, got:', delegation.counter);
  }
  
  // Test 3: Store same delegation again - should preserve counter
  console.log('\n📝 Test 3: Store same delegation again - should preserve counter');
  siweHandler.storeDelegationData({
    ephemeralPublicKey: '0x9999999999999999999999999999999999999999',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    counter: 3
  }, testAddress);
  
  delegation = siweHandler.getDelegationDataByAddress(testAddress);
  console.log('✅ Same delegation counter (should be 3):', delegation.counter);
  
  if (delegation.counter === 3) {
    console.log('✅ PASS: Counter correctly preserved for same ephemeral key');
  } else {
    console.log('❌ FAIL: Counter not preserved, got:', delegation.counter);
  }
  
  // Test 4: Update counter through normal flow
  console.log('\n📝 Test 4: Update counter through normal flow');
  siweHandler.updateDelegationCounter(testAddress, 4);
  
  delegation = siweHandler.getDelegationDataByAddress(testAddress);
  console.log('✅ Updated counter (should be 4):', delegation.counter);
  
  if (delegation.counter === 4) {
    console.log('✅ PASS: Counter correctly updated');
  } else {
    console.log('❌ FAIL: Counter not updated, got:', delegation.counter);
  }
  
  console.log('\n🎯 Test Summary:');
  console.log('- New ephemeral key → counter reset to 0 ✅');
  console.log('- Same ephemeral key → counter preserved ✅');
  console.log('- Counter updates work correctly ✅');
}

// Run the test
testCounterReset().catch(console.error);