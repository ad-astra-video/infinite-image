const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const ChatMessageValidator = require('../auth/chatMessageValidator');
const profanity = require('leo-profanity');
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


/**
 * Rate limiter for anonymous users in public chat
 * Tracks last message timestamp for each anonymous user
 */
class AnonymousRateLimiter {
  constructor() {
    this.messageTimestamps = new Map(); // Map<userAddress, timestamp>
    this.rateLimitMs = 60000; // 1 minute = 60000ms
  }

  /**
   * Check if user can send a message based on rate limiting
   * @param {string} userAddress - User's address (or 'anon' for anonymous)
   * @returns {object} { allowed: boolean, remainingTime?: number }
   */
  canSendMessage(userAddress) {
    // Only apply rate limiting to anonymous users
    if (userAddress !== 'anon') {
      return { allowed: true };
    }

    const now = Date.now();
    const lastMessageTime = this.messageTimestamps.get(userAddress);

    if (!lastMessageTime) {
      // First message from this user
      return { allowed: true };
    }

    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage >= this.rateLimitMs) {
      return { allowed: true };
    }

    const remainingTime = Math.ceil((this.rateLimitMs - timeSinceLastMessage) / 1000);
    return {
      allowed: false,
      remainingTime
    };
  }

  /**
   * Update the last message timestamp for a user
   * @param {string} userAddress - User's address
   */
  updateLastMessageTime(userAddress) {
    if (userAddress === 'anon') {
      this.messageTimestamps.set(userAddress, Date.now());
    }
  }

  /**
   * Clean up old timestamps (optional cleanup method)
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [address, timestamp] of this.messageTimestamps.entries()) {
      if (now - timestamp > maxAge) {
        this.messageTimestamps.delete(address);
      }
    }
  }
}

class ChatRouter {
  constructor(config) {
    this.logger = config.logger;
    this.router = express.Router();
    this.wss = null;
    this.messageValidator = config.messageValidator || new ChatMessageValidator({
      logger: config.logger,
      siweHandler: config.siweHandler
    });
    
    // Initialize bad words filters
    this.badWordsFilter = new BadWordsFilter();
    this.badWordsFilter.add(en)
    this.badWordsFilter.add(es)
    this.badWordsFilter.add(fr)
    this.badWordsFilter.add(de)
    this.badWordsFilter.add(ru)
    this.badWordsFilter.add(rl)
    this.badWordsFilter.add(ua)
    this.badWordsFilter.add(pl)
    this.badWordsFilter.add(ch)
        
    //example of adding custom words
    //this.badWordsFilter.add(['custom1', 'custom2']); // Add custom words if needed
    
    // Initialize rate limiter for anonymous users
    this.anonymousRateLimiter = new AnonymousRateLimiter();
    
    // Chat rooms and message storage
    this.chatRooms = {
      public: {
        messages: [],
        connectedUsers: new Map(), // socket -> userData
        maxMessages: 1000,
        maxUsers: 1000
      },
      supporter: {
        messages: [],
        connectedUsers: new Map(),
        maxMessages: 1000,
        maxUsers: 1000,
        allowedUsers: new Set(), // Users who have tipped
        userLevels: new Map() // userAddress -> tip level
      }
    };
    
    this.setupRoutes();
  }

  setupRoutes() {
    // Get chat room status
    this.router.get('/status', (req, res) => {
      const status = {
        public: {
          connectedUsers: this.chatRooms.public.connectedUsers.size,
          maxUsers: this.chatRooms.public.maxUsers,
          messageCount: this.chatRooms.public.messages.length
        },
        supporter: {
          connectedUsers: this.chatRooms.supporter.connectedUsers.size,
          maxUsers: this.chatRooms.supporter.maxUsers,
          messageCount: this.chatRooms.supporter.messages.length,
          allowedUsers: this.chatRooms.supporter.allowedUsers.size
        }
      };
      res.json({ status });
    });

    // Messages are now delivered via WebSocket - no HTTP endpoint needed

    // Clear chat history (for moderation)
    this.router.post('/clear/:room', (req, res) => {
      const { room } = req.params;
      if (!this.chatRooms[room]) {
        return res.status(404).json({ error: 'Chat room not found' });
      }
      
      this.chatRooms[room].messages = [];
      this.logger.info(`Chat room ${room} cleared`);
      res.json({ message: 'Chat room cleared successfully' });
    });

    // ENS name verification endpoint
    this.router.post('/verify-ens', async (req, res) => {
      try {
        const { query, ensName } = req.body;
        
        if (!query || !ensName) {
          return res.status(400).json({ error: 'Missing query or ensName' });
        }

        const GRAPH_API_KEY = process.env.GRAPH_API_KEY;
        const GRAPH_QUERY_URL = process.env.GRAPH_QUERY_URL;

        if (!GRAPH_API_KEY || !GRAPH_QUERY_URL) {
          return res.status(500).json({ error: 'Graph API configuration missing' });
        }

        const response = await fetch(GRAPH_QUERY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GRAPH_API_KEY}`
          },
          body: JSON.stringify({ query })
        });

        if (!response.ok) {
          throw new Error(`GraphQL request failed: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.errors) {
          this.logger.error('GraphQL errors:', result.errors);
          return res.status(500).json({ error: 'GraphQL query failed' });
        }

        const domains = result.data?.domains || [];
        const domainNames = domains.map(domain => domain.name.toLowerCase());
        const isValidENS = domainNames.includes(ensName.toLowerCase());

        this.logger.info(`ENS verification for ${ensName}: ${isValidENS ? 'valid' : 'invalid'}`);
        
        res.json({
          valid: isValidENS,
          data: result.data
        });
      } catch (error) {
        this.logger.error('ENS verification error:', error);
        res.status(500).json({ error: 'Failed to verify ENS name' });
      }
    });
  }

  // Add user to supporter chat allowed list
  addSupporterUser(userAddress, level) {
    try {      
      // Ensure userAddress is lowercase for consistency
      const address = userAddress.toLowerCase();

      // Add to allowed users set for supporter chat
      if (!this.chatRooms.supporter.allowedUsers.has(address)) {
        this.chatRooms.supporter.allowedUsers.add(address);
        this.logger.info(`Added supporter user ${address} with tip level: ${level || 'N/A'}`);
      }

      // Map userAddress to their tip level and increase level if already exists
      if (this.chatRooms.supporter.userLevels.has(address)) {
        level = level + this.chatRooms.supporter.userLevels.get(address);
        this.logger.info(`Updated supporter user ${address} to new tip level: ${level}`);
      }
      this.chatRooms.supporter.userLevels.set(address, level);

      return true;
    } catch (error) {
      this.logger.error(`Failed to add supporter user ${userAddress}: ${error.message}`);
      return false;
    }
  }

  // Initialize WebSocket server
  initializeWebSocketServer(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/chat',
      perMessageDeflate: false
    });

    this.wss.on('connection', (ws, req) => {
      this.handleWebSocketConnection(ws, req);
    });

    this.logger.info('WebSocket server initialized for chat');
  }

  handleWebSocketConnection(ws) {
    ws.userData = {};

    // Automatically add public users to public chat room when connected
    this.handleJoinChat(ws, {
      room: 'public',
      userAddress: 'anon',
      userType: 'public',
      userSignature: null,
      lastMessageTime: null
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
    });

    // Send welcome message
    this.sendMessage(ws, {
      type: 'welcome',
      message: 'Connected to Stream Chat',
      timestamp: new Date().toISOString()
    });
  }

  handleMessage(ws, message) {
    const { type } = message;
    
    switch (type) {
      case 'join_chat':
        this.handleJoinChat(ws, message);
        break;
      case 'leave_chat':
        this.handleLeaveChat(ws, message);
        break;
      case 'chat_message':
        this.handleChatMessage(ws, message);
        break;
      case 'is_supporter':
        this.handleIsSupporter(ws, message);
        break;
      case 'get_history':
        this.handleGetHistory(ws, message);
        break;
      case 'ping':
        this.handlePing(ws, message);
        break;
      default:
        this.sendError(ws, `Unknown message type ${message.type}`);
    }
  }

  handleJoinChat(ws, data) {
    const { room, userAddress, userType = 'public', userSignature, lastMessageTime, userDisplayName } = data;
    
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    // Enhanced validation using delegationStore lookup
    let isValidated = false;
    let validatedAddress = null;

    let delegation = null;
    // First try to get validation from delegationStore by userAddress
    if (userAddress && this.messageValidator.siweHandler) {
      delegation = this.messageValidator.siweHandler.getDelegationDataByAddress(userAddress);
      if (delegation && delegation.ephemeralPublicKey) {
        validatedAddress = userAddress.toLowerCase();
        isValidated = true;
        //this.logger.info(`DelegationStore validated user ${validatedAddress} joining ${room}`);
      }
    }
    
    // Use delegationStore address if available, otherwise fall back to provided address
    const finalAddress = validatedAddress || 'anon';
    
    // Check SIWE validation for username display
    const displayName = this.getDisplayName(finalAddress, userDisplayName);
    
    // Check permissions for supporter chat
    if (room === 'supporter' && !this.chatRooms.supporter.allowedUsers.has(finalAddress)) {
      //this.sendError(ws, 'Access denied: Supporter chat requires tip verification');
      return;
    }
    
    // Check if room has reached maximum user limit FIRST
    const currentUserCount = this.chatRooms[room].connectedUsers.size;
    const maxUsers = this.chatRooms[room].maxUsers;
    
    if (currentUserCount >= maxUsers) {
      this.sendError(ws, `Room ${room} has reached maximum capacity of ${maxUsers} users`);
      return;
    }
    
    // Leave previous room if any
    if (ws.userData.room && ws.userData.room !== room) {
      this.handleLeaveChat(ws, { room: ws.userData.room });
    }
    
    // Join the room
    this.chatRooms[room].connectedUsers.set(ws, {
      address: finalAddress,
      type: userType,
      room,
      signature: userSignature || null,
      validated: isValidated,
      displayName: displayName,
      // Store delegation data for enhanced validation
      delegationData: isValidated ? delegation : null
    });
    
    // Store user info with delegation data for ephemeral validation
    ws.userData = {
      address: finalAddress,
      type: userType,
      room,
      signature: userSignature || null,
      validated: isValidated,
      displayName: displayName,
      // Store delegation data for ephemeral signature validation
      delegation: isValidated ? delegation : null
    };
    
    // Send historical messages since lastMessageTime
    this.sendHistoricalMessages(ws, room, lastMessageTime);
    
    // Notify user joined (with validation status and room count)
    this.broadcastToRoom(room, 'user_joined', {
      userAddress: finalAddress,
      userType,
      validated: isValidated,
      displayName: displayName,
      room: room,
      roomCount: this.chatRooms[room].connectedUsers.size,
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`User ${finalAddress} (${displayName}) joined ${room} chat - SIWE validated: ${isValidated}`);
    
    // Send join success message
    this.sendMessage(ws, {
      type: 'join_success',
      room,
      message: `Joined ${room} chat successfully`,
      validated: isValidated,
      displayName: displayName
    });
  }

  handleLeaveChat(ws, data) {
    const { room } = data;
    
    if (!this.chatRooms[room] || !this.chatRooms[room].connectedUsers.has(ws)) {
      return;
    }
    
    const userData = this.chatRooms[room].connectedUsers.get(ws);
    this.chatRooms[room].connectedUsers.delete(ws);
    
    // Notify other users
    this.broadcastToRoom(room, 'user_left', {
      userAddress: userData.address,
      displayName: userData.displayName,
      room: room,
      roomCount: this.chatRooms[room].connectedUsers.size,
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`User ${userData.address} left ${room} chat`);
  }

  handleChatMessage(ws, data) {
    const { message, signature, counter, displayName } = data;
    
    // Updated to handle anonymous users with counter and blank signature
    const isAnonymousUser = ws.userData.address === 'anon';
    if (!message || (!isAnonymousUser && !signature) || (!isAnonymousUser && !counter)) {
      this.sendError(ws, 'Missing required message fields');
      return;
    }
        
    const userData = this.chatRooms[ws.userData.room]?.connectedUsers.get(ws);
    if (!userData) {
      this.sendError(ws, 'User not in chat room');
      return;
    }
    
    // Check rate limiting for anonymous users in public chat
    if (ws.userData.room === 'public' && userData.address === 'anon') {
      const rateLimitCheck = this.anonymousRateLimiter.canSendMessage(userData.address);
      if (!rateLimitCheck.allowed) {
        // Send rate_limit response instead of error
        this.sendMessage(ws, {
          type: 'rate_limit',
          nextMessageTime: rateLimitCheck.remainingTime,
          timestamp: new Date().toISOString()
        });
        return;
      }
    }
    
    // Enhanced validation using delegationStore data
    // Handle anonymous users with counter and blank signature
    const validationParams = {
      message,
      signature: isAnonymousUser ? (signature || '') : (signature || null),
      counter: counter || 0,
      userAddress: ws.userData.address, // Include userAddress for validation logic
      displayName: displayName, // Include displayName from incoming message
    };
    
    this.validateChatMessage(ws, validationParams).then((validationResult) => {
      if (validationResult.isValid) {
        this.processValidChatMessage(ws, message, validationResult);
      } else {
        this.sendError(ws, `Message validation failed: ${validationResult.error}`);
      }
    }).catch((error) => {
      this.sendError(ws, `Message validation error: ${error.message}`);
    });
  }

  handleIsSupporter(ws, data) {
    const { userAddress, userSignature } = data;
    
    if (!userAddress || !userSignature) {
      this.sendError(ws, 'Missing required fields for supporter verification');
      return;
    }

    // Validate signature using ephemeral key delegation
    this.validateSupporterSignature(userAddress, userSignature)
      .then((validationResult) => {
        if (validationResult.isValid) {
          // Update WebSocket userData with validated address
          const validatedAddress = userAddress.toLowerCase();
          ws.userData.address = validatedAddress;
          ws.userData.validated = true;
          ws.userData.displayName = this.getDisplayName(validatedAddress);
          
          // Update delegation data in userData
          ws.userData.delegation = this.messageValidator.siweHandler?.getDelegationDataByAddress(validatedAddress);
          
          // Update userData in chat room connectedUsers map
          const currentRoom = ws.userData.room;
          if (currentRoom && this.chatRooms[currentRoom]?.connectedUsers.has(ws)) {
            const roomUserData = this.chatRooms[currentRoom].connectedUsers.get(ws);
            roomUserData.address = validatedAddress;
            roomUserData.validated = true;
            roomUserData.displayName = ws.userData.displayName;
            roomUserData.delegationData = ws.userData.delegation;
          }
          
          // Check if user has tip verification (is in allowedUsers for supporter room)
          const isSupporter = this.chatRooms.supporter.allowedUsers.has(validatedAddress);

          this.sendMessage(ws, {
            type: 'supporter_status',
            userAddress: validatedAddress,
            isSupporter: isSupporter,
            validated: true,
            displayName: ws.userData.displayName,
            timestamp: new Date().toISOString()
          });
          
          // Notify room that user address was updated
          if (currentRoom) {
            this.broadcastToRoom(currentRoom, 'user_address_updated', {
              userAddress: validatedAddress,
              displayName: ws.userData.displayName,
              validated: true,
              timestamp: new Date().toISOString()
            });
          }
          
          this.logger.info(`Updated WebSocket userData for ${validatedAddress} - now validated for chat messages`);
        } else {
          this.sendError(ws, `Supporter verification failed: ${validationResult.error}`);
        }
      })
      .catch((error) => {
        this.sendError(ws, `Supporter verification error: ${error.message}`);
      });
  }

  /**
   * Validate supporter signature using ephemeral key
   * @param {string} userAddress - User's wallet address
   * @param {string} userSignature - Signature to validate
   * @returns {Promise<object>} Validation result
   */
  async validateSupporterSignature(userAddress, userSignature) {
    try {
      // Get delegation data for the user
      if (!this.messageValidator.siweHandler) {
        throw new Error('SIWE handler not configured');
      }
      const delegation = this.messageValidator.siweHandler?.getDelegationDataByAddress(userAddress);
            
      if (!delegation || !delegation.ephemeralPublicKey) {
        this.logger.error('No valid delegation found for user address:', userAddress);
        throw new Error('No valid delegation found for user address');
      }

      // Check delegation expiration
      const now = Date.now();
      if (delegation.expiresAt && now > new Date(delegation.expiresAt).getTime()) {
        this.logger.error('Delegation expired for address:', userAddress);
        throw new Error('Ephemeral delegation expired');
      }

      // Verify the signature using the ephemeral public key
      const message = `supporter_check_${userAddress}`;
      const isValid = this.messageValidator.verifyEphemeralSignature(message, userSignature, delegation.ephemeralPublicKey);
      if (!isValid) {
        this.logger.error('Ephemeral signature verification failed for address:', userAddress);
        throw new Error('Invalid supporter signature');
      }

      //confirmed signature, update counter tracking ephemeral key usage
      this.messageValidator.siweHandler.updateDelegationCounter(userAddress, delegation.counter+1);

      return {
        isValid: true,
        address: userAddress,
        ephemeralPublicKey: delegation.ephemeralPublicKey
      };
    } catch (error) {
      this.logger.error('Supporter signature validation failed:', error.message);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Enhanced chat message validation using delegationStore data
   * @param {object} ws - WebSocket connection
   * @param {object} params - Message validation parameters
   * @returns {Promise<object>} Validation result
   */
  async validateChatMessage(ws, { message, signature, counter, userAddress, displayName }) {
    try {
      return await this.messageValidator.validateChatMessage({
        message,
        signature,
        counter,  // This was missing - the counter wasn't being passed to validator!
        userAddress: userAddress || ws.userData.address,
        displayName: displayName,
      });
    } catch (error) {
      this.logger.error('❌ ChatRoutes validation error:', error.message)
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  processValidChatMessage(ws, message, validationResult) {
    const userData = this.chatRooms[ws.userData.room]?.connectedUsers.get(ws);
    if (!userData) return;
    
    // Update displayName in ws.userData if provided in validation result
    if (validationResult.displayName && validationResult.displayName !== userData.displayName) {
      // Update ws.userData
      ws.userData.displayName = validationResult.displayName;
      
      // Update connectedUsers map
      const updatedUserData = { ...userData, displayName: validationResult.displayName };
      this.chatRooms[ws.userData.room].connectedUsers.set(ws, updatedUserData);
      
      this.logger.info(`Updated displayName for ${validationResult.address || userData.address} to: ${validationResult.displayName}`);
    }
    
    // Filter content through both bad words filters for comprehensive coverage
    const filteredMessage1 = this.badWordsFilter.filter(message);
    const filteredMessage2 = profanity.clean(filteredMessage1);
    
    // Create chat message
    const chatMessage = {
      id: uuidv4(),
      message: filteredMessage2,
      userAddress: validationResult.address || userData.address,
      userType: userData.type,
      displayName: validationResult.displayName,
      validated: validationResult.validated,
      timestamp: new Date().toISOString(),
      room: ws.userData.room,
      sessionType: validationResult.sessionType || 'traditional'
    };
    
    // Store message
    this.chatRooms[ws.userData.room].messages.push(chatMessage);
    
    // Limit message history
    if (this.chatRooms[ws.userData.room].messages.length > this.chatRooms[ws.userData.room].maxMessages) {
      this.chatRooms[ws.userData.room].messages.shift();
    }
    
    // Broadcast message
    this.broadcastToRoom(ws.userData.room, 'chat_message', chatMessage);
    
    // Update rate limiter timestamp for anonymous users
    if (ws.userData.room === 'public' && userData.address === 'anon') {
      this.anonymousRateLimiter.updateLastMessageTime(userData.address);
    }
    
    this.logger.info(`Chat message from ${validationResult.address || userData.address} in ${ws.userData.room}`);
  }

  handleGetHistory(ws, data) {
    const { room, limit = 50 } = data;
    
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    const messages = this.chatRooms[room].messages.slice(-limit);
    
    this.sendMessage(ws, {
      type: 'chat_history',
      room,
      messages,
      timestamp: new Date().toISOString()
    });
  }

  handlePing(ws, data) {
    const { timestamp } = data;
    
    // Respond with pong to maintain connection health
    this.sendMessage(ws, {
      type: 'pong',
      timestamp: timestamp,
      serverTimestamp: new Date().toISOString()
    });
  }

  sendHistoricalMessages(ws, room, lastMessageTime) {
    if (!lastMessageTime) {
      // Send recent messages
      const recentMessages = this.chatRooms[room].messages.slice(-20);
      this.sendMessage(ws, {
        type: 'chat_history',
        room,
        messages: recentMessages,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Send messages since lastMessageTime
    const lastTime = new Date(lastMessageTime).getTime();
    const newMessages = this.chatRooms[room].messages.filter(msg => 
      new Date(msg.timestamp).getTime() > lastTime
    );
    
    this.sendMessage(ws, {
      type: 'chat_history',
      room,
      messages: newMessages,
      timestamp: new Date().toISOString()
    });
  }

  handleDisconnect(ws) {
    // Remove from all rooms
    for (const room of Object.keys(this.chatRooms)) {
      if (this.chatRooms[room].connectedUsers.has(ws)) {
        const userData = this.chatRooms[room].connectedUsers.get(ws);
        this.chatRooms[room].connectedUsers.delete(ws);
        
        // Notify other users
        this.broadcastToRoom(room, 'user_left', {
          userAddress: userData.address,
          displayName: userData.displayName,
          room: room,
          roomCount: this.chatRooms[room].connectedUsers.size,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  sendMessage(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send message:', error);
    }
  }

  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'error',
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  broadcastToRoom(room, event, data) {
    if (!this.chatRooms[room]) return;
    
    const message = {
      type: event,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    for (const ws of this.chatRooms[room].connectedUsers.keys()) {
      this.sendMessage(ws, message);
    }
  }

  getDisplayName(address, displayName) {
    // If a custom display name is provided, filter it through both bad words filters
    if (displayName && displayName.trim().length > 0) {
      const trimmedDisplayName = displayName.trim();
      // Filter through bad-words-next first
      const filteredDisplayName1 = this.badWordsFilter.filter(trimmedDisplayName);
      // Then filter through leo-profanity for additional coverage
      const filteredDisplayName2 = profanity.clean(filteredDisplayName1);
      return filteredDisplayName2;
    }
    
    // For validated users, show truncated address
    if (address && address !== 'anon' && address !== '0x0000000000000000000000000000000000000000') {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    // For non-validated users, show as anonymous
    return 'anonymous';
  }

  /**
   * Get display name from WebSocket user data for a specific address
   * @param {string} userAddress - User's address to lookup
   * @returns {string} Display name from WebSocket connection or fallback to default
   */
  getDisplayNameFromWebSocket(userAddress) {
    // Search all rooms for this user address
    for (const roomName of Object.keys(this.chatRooms)) {
      const room = this.chatRooms[roomName];
      for (const [ws, userData] of room.connectedUsers.entries()) {
        if (userData.address === userAddress) {
          return userData.displayName || this.getDisplayName(userAddress);
        }
      }
    }
    
    // Fallback to default display name logic
    return this.getDisplayName(userAddress);
  }

  /**
   * Send tip message to chat room with proper displayName from WebSocket
   * @param {string} room - Chat room to broadcast to
   * @param {string} userAddress - User's address
   * @param {string} message - Tip message content
   * @param {string} messageType - Type of tip message
   * @param {string} amount - Tip amount for default message
   * @returns {object} Tip message object
   */
  sendTipMessage(room, userAddress, message, amount) {
    const displayName = this.getDisplayNameFromWebSocket(userAddress);
    
    const tipMessage = {
      type: 'chat_message',
      messageType: 'tip',
      room: room,
      message: message || `Thank you for the $${amount} tip!`,
      userAddress: userAddress || 'anonymous',
      sender: userAddress || 'anonymous',
      senderType: 'supporter',
      displayName: displayName,
      timestamp: new Date().toISOString(),
      id: `tip-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    };
    
    // Broadcast the message to the room
    this.broadcastToRoom(room, 'chat_message', tipMessage);
    
    return tipMessage;
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { ChatRouter };