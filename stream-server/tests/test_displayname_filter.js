const { ChatRouter } = require('../src/routes/chatRoutes');

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

// Create a ChatRouter instance for testing
const chatRouter = new ChatRouter({
  logger: mockLogger,
  messageValidator: null,
  siweHandler: null
});

console.log('Testing display name filtering through bad words filter:');

// Test cases for display name filtering
const testCases = [
  {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    displayName: 'CleanUser123',
    expected: 'CleanUser123'
  },
  {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    displayName: 'BadUser',
    expected: 'BadUser' // Should remain unchanged if no bad words
  },
  {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    displayName: 'UserWithfuck',
    expected: '***' // Should filter bad words (fuck -> ***)
  },
  {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    displayName: 'DamnUser',
    expected: '***' // Should filter bad words (filter replaces bad words with asterisks)
  },
  {
    address: 'anon',
    displayName: '',
    expected: 'anonymous' // Should return anonymous for empty display name
  },
  {
    address: '0x0000000000000000000000000000000000000000',
    displayName: '',
    expected: 'anonymous' // Should return anonymous for zero address
  }
];

console.log('\nRunning display name filter tests:');
testCases.forEach((testCase, index) => {
  const result = chatRouter.getDisplayName(testCase.address, testCase.displayName);
  console.log(`Test ${index + 1}:`);
  console.log(`  Address: ${testCase.address}`);
  console.log(`  Display Name: "${testCase.displayName}"`);
  console.log(`  Expected: "${testCase.expected}"`);
  console.log(`  Result:   "${result}"`);
  console.log(`  Status:   ${result === testCase.expected ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
});

console.log('Display name filtering test completed!');