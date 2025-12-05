const WebSocket = require('ws');
const { ChatRouter } = require('../src/routes/chatRoutes.js');

// Test configuration
const TEST_ROOM = 'public';
const MAX_USERS = 1000;

class SimpleRoomLimitTest {
  constructor() {
    this.chatRouter = null;
    this.connections = [];
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      errors: []
    };
  }

  // Generate unique user address for testing
  generateUserAddress(index) {
    return `0x${index.toString(16).padStart(40, '0')}`;
  }

  // Create mock WebSocket connection
  createMockWebSocket() {
    const ws = {
      readyState: WebSocket.OPEN,
      userData: { address: null, type: 'public', room: null },
      send: (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`📨 Mock WS received: ${message.type}`);
          if (message.type === 'error') {
            ws.lastError = message.message;
          }
        } catch (error) {
          console.log('❌ Failed to parse message:', error.message);
        }
      },
      close: () => {
        console.log('🔌 Mock WS closed');
      }
    };
    
    return ws;
  }

  // Test joining users directly through ChatRouter
  async testUserJoin(userIndex, room = TEST_ROOM) {
    return new Promise((resolve, reject) => {
      const ws = this.createMockWebSocket();
      const userAddress = this.generateUserAddress(userIndex);
      
      console.log(`🧪 Testing user ${userIndex} joining ${room}`);
      
      try {
        this.chatRouter.handleJoinChat(ws, {
          room: room,
          userAddress: userAddress,
          userType: 'public'
        });
        
        if (ws.lastError) {
          reject(new Error(ws.lastError));
        } else {
          resolve({ ws, userAddress });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  // Test joining exactly 1000 users
  async testMaxUserLimit() {
    console.log('\n🧪 Testing 1000 user limit...');
    this.testResults.totalTests++;
    
    try {
      const promises = [];
      
      // Try to join 1000 users
      for (let i = 0; i < MAX_USERS; i++) {
        promises.push(this.testUserJoin(i));
      }
      
      const results = await Promise.all(promises);
      console.log(`✅ Successfully joined ${results.length} users to ${TEST_ROOM} room`);
      
      this.testResults.passedTests++;
      return true;
    } catch (error) {
      console.log(`❌ Failed to join 1000 users: ${error.message}`);
      this.testResults.failedTests++;
      this.testResults.errors.push(`Max user limit test failed: ${error.message}`);
      return false;
    }
  }

  // Test that 1001st user gets rejected
  async testUserLimitRejection() {
    console.log('\n🧪 Testing user limit rejection...');
    this.testResults.totalTests++;
    
    try {
      // Try to join 1001st user
      await this.testUserJoin(MAX_USERS);
      
      console.log('❌ Expected 1001st user to be rejected, but they were accepted');
      this.testResults.failedTests++;
      this.testResults.errors.push('User limit rejection test failed: 1001st user was accepted');
      return false;
    } catch (error) {
      if (error.message.includes('maximum capacity')) {
        console.log('✅ 1001st user correctly rejected:', error.message);
        this.testResults.passedTests++;
        return true;
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
        this.testResults.failedTests++;
        this.testResults.errors.push(`User limit rejection test failed: ${error.message}`);
        return false;
      }
    }
  }

  // Test room status
  async testRoomStatus() {
    console.log('\n🧪 Testing room status...');
    this.testResults.totalTests++;
    
    try {
      const publicRoom = this.chatRouter.chatRooms.public;
      const currentUsers = publicRoom.connectedUsers.size;
      const maxUsers = publicRoom.maxUsers;
      
      console.log(`📊 Room status: ${currentUsers}/${maxUsers} users`);
      
      if (currentUsers === MAX_USERS && maxUsers === MAX_USERS) {
        console.log('✅ Room status correctly shows 1000/1000 users');
        this.testResults.passedTests++;
        return true;
      } else {
        console.log(`❌ Room status incorrect: ${currentUsers}/${maxUsers}`);
        this.testResults.failedTests++;
        this.testResults.errors.push('Room status test failed: incorrect user count');
        return false;
      }
    } catch (error) {
      console.log(`❌ Room status test failed: ${error.message}`);
      this.testResults.failedTests++;
      this.testResults.errors.push(`Room status test failed: ${error.message}`);
      return false;
    }
  }

  // Test user departure and new user acceptance
  async testUserDepartureAndRejoining() {
    console.log('\n🧪 Testing user departure and rejoining...');
    this.testResults.totalTests++;
    
    try {
      // Get some connections to simulate departure
      const room = this.chatRouter.chatRooms.public;
      const connections = Array.from(room.connectedUsers.keys());
      
      // Remove first 10 users
      for (let i = 0; i < 10 && i < connections.length; i++) {
        const ws = connections[i];
        this.chatRouter.handleLeaveChat(ws, { room: TEST_ROOM });
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try to join 10 new users
      const newUserPromises = [];
      for (let i = MAX_USERS; i < MAX_USERS + 10; i++) {
        newUserPromises.push(this.testUserJoin(i));
      }
      
      const newResults = await Promise.all(newUserPromises);
      console.log(`✅ Successfully joined ${newResults.length} new users after departures`);
      
      this.testResults.passedTests++;
      return true;
    } catch (error) {
      console.log(`❌ User departure/rejoining test failed: ${error.message}`);
      this.testResults.failedTests++;
      this.testResults.errors.push(`User departure/rejoining test failed: ${error.message}`);
      return false;
    }
  }

  // Run all tests
  async runTests() {
    console.log('🚀 Starting Simple Room Limit Tests');
    console.log('===========================================');
    
    try {
      // Initialize chat router
      this.chatRouter = new ChatRouter({
        logger: {
          info: (msg) => console.log('INFO:', msg),
          warn: (msg) => console.log('WARN:', msg),
          error: (msg) => console.log('ERROR:', msg)
        }
      });
      
      // Run tests
      await this.testMaxUserLimit();
      await this.testUserLimitRejection();
      await this.testRoomStatus();
      await this.testUserDepartureAndRejoining();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.log(`❌ Test suite failed: ${error.message}`);
      this.testResults.failedTests++;
      this.testResults.errors.push(`Test suite failed: ${error.message}`);
    }
  }

  // Print test results
  printResults() {
    console.log('\n📊 Test Results');
    console.log('==================');
    console.log(`Total Tests: ${this.testResults.totalTests}`);
    console.log(`Passed: ${this.testResults.passedTests}`);
    console.log(`Failed: ${this.testResults.failedTests}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    const successRate = (this.testResults.passedTests / this.testResults.totalTests * 100).toFixed(1);
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (this.testResults.failedTests === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️ Some tests failed. Check the errors above.');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new SimpleRoomLimitTest();
  test.runTests().then(() => {
    process.exit(test.testResults.failedTests > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = SimpleRoomLimitTest;