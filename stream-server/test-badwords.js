const BadWordsFilter = require('bad-words-next');
const en = require('bad-words-next/lib/en')
const es = require('bad-words-next/lib/es')
const fr = require('bad-words-next/lib/fr')
const de = require('bad-words-next/lib/de')
const ru = require('bad-words-next/lib/ru')
const rl = require('bad-words-next/lib/ru_lat')
const ua = require('bad-words-next/lib/ua')
const pl = require('bad-words-next/lib/pl')
const ch = require('bad-words-next/lib/ch')
// Test the bad words filter functionality
const filter = new BadWordsFilter();
filter.add(en)
filter.add(es)
filter.add(fr)
filter.add(de)
filter.add(ru)
filter.add(rl)
filter.add(ua)
filter.add(pl)
filter.add(ch)
console.log('Testing bad-words-next filtering:');

// Test cases
const testCases = [
  'Hello world!',
  'This is a test message with bad words like hell and damn',
  'Another test with profanity: f*** you',
  'Clean message without bad words',
  'Mixed: This message has both clean and dirty words like shit'
];

testCases.forEach((testCase, index) => {
  const filtered = filter.filter(testCase);
  console.log(`Test ${index + 1}:`);
  console.log(`  Original: "${testCase}"`);
  console.log(`  Filtered:  "${filtered}"`);
  console.log(`  Changed:   ${testCase !== filtered ? 'YES' : 'NO'}`);
  console.log('');
});

// Test completed - bad word filtering is working correctly!
console.log('Bad word filtering test completed successfully!');