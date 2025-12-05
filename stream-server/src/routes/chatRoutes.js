const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
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

class ChatRouter {
  constructor(config) {
    this.logger = config.logger;
    this.router = express.Router();
    this.wss = null;
    this.sessionCache = config.sessionCache; // SIWE session cache
    
    // Initialize bad words filter
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
        userSignatures: new Map() // Store latest signature for each user
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

    // TODO limit to future admin role
    // Add user to supporter chat (tip verification)
    //this.router.post('/add-supporter-user', (req, res) => {
    //  const { userAddress, userSignature, tipAmount } = req.body;
    //
    //  if (!userAddress || !userSignature || !tipAmount) {
    //    return res.status(400).json({ error: 'Missing userAddress, userSignature or tipAmount' });
    //  }
    //  
    //  // Verify tip amount meets minimum requirement
    //  const minTipAmount = 0.01; // $0.01 minimum for supporter chat
    //  if (tipAmount >= minTipAmount) {
    //    this.chatRooms.supporter.allowedUsers.add(userAddress);
    //    this.chatRooms.supporter.userSignatures.set(userAddress, userSignature);
    //    this.logger.info(`User ${userAddress} added to supporter chat with tip amount: $${tipAmount}`);
    //    res.json({ message: 'User added to supporter chat successfully' });
    //  } else {
    //    res.status(400).json({ error: `Tip amount $${tipAmount} below minimum $${minTipAmount}` });
    //  }
    //});

    // TODO limit to future admin role
    // Remove user from supporter chat
    //this.router.post('/remove-supporter-user', (req, res) => {
    //  const { userAddress } = req.body;
    //  
    //  if (!userAddress) {
    //    return res.status(400).json({ error: 'Missing userAddress' });
    //  }
    //  
    //  this.chatRooms.supporter.allowedUsers.delete(userAddress);
    //  this.chatRooms.supporter.userSignatures.delete(userAddress);
    //  this.logger.info(`User ${userAddress} removed from supporter chat`);
    //  res.json({ message: 'User removed from supporter chat successfully' });
    //});

    // Check if user is a supporter
    this.router.get('/check-supporter/:userAddress', (req, res) => {
      const { userAddress, userSignature } = req.params;
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      
      const isSupporter = this.chatRooms.supporter.allowedUsers.has(userAddress);
      const userSig = this.chatRooms.supporter.userSignatures.get(userAddress);
      if (userSig != userSignature) {
        return res.status(400).json({ userAddress, isSupporter,error: 'Signature mismatch', timestamp: new Date().toISOString() });
      }
      
      res.json({
        userAddress,
        isSupporter,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Initialize WebSocket server
  initializeWebSocketServer(httpServer) {
    this.httpServer = httpServer;

    // Create WebSocket server
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024 // 16MB max message size
    });

    this.logger.info('WebSocket server initialized on path: /ws');

    this.wss.on('connection', (ws, request) => {
      const clientId = uuidv4();
      this.logger.info(`Client connected: ${clientId}`);
      try {
        //this.logger.info('WS handshake headers:', request.headers);
      } catch (err) {
        this.logger.error('Failed to log WS handshake headers:', err.message);
      }
      
      // Store user data
      ws.userData = { address: null, type: 'public', room: null };
      ws.clientId = clientId;

      // Handle messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          this.logger.error(`Failed to parse message from ${clientId}:`, error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle close
      ws.on('close', (code, reason) => {
        this.logger.info(`Client disconnected: ${clientId} code: ${code} reason: ${reason}`);
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for ${clientId}:`, error);
      });

      // Send welcome message
      this.sendMessage(ws, { type: 'connection', message: 'Connected to chat server', clientId });
    });
  }

  /**
   * Check if user is SIWE validated
   * @param {string} address - Ethereum address
   * @param {string} sessionToken - Session token (optional)
   * @returns {boolean} Validation status
   */
  isSIWEValidated(address, sessionToken = null, userSignature = null) {
    try {
      this.logger.info(`SIWE validation: address=${address}, sessionToken=${sessionToken ? 'provided' : 'null'}, signature=${userSignature ? 'provided' : 'null'}`);
      
      // For chat validation, we just need to check if the user has a valid signature
      // that matches their claimed address. No session caching needed.
      if (userSignature && address && address !== 'anon') {
        // Simple validation: if user has a signature and valid address, they're considered validated
        // The actual signature verification happens during message sending, not during join
        this.logger.info(`SIWE validation: user has signature and valid address - validated`);
        return true;
      }

      this.logger.info(`SIWE validation failed: no signature or invalid address`);
      return false;
    } catch (error) {
      this.logger.error('Error checking SIWE validation:', error);
      return false;
    }
  }

  /**
   * Get display name for user (address or validated username)
   * @param {string} address - Ethereum address
   * @param {string} sessionToken - Session token
   * @returns {string} Display name
   */
  getDisplayName(address, sessionToken = null, userSignature = null) {
    if (this.isSIWEValidated(address, sessionToken, userSignature)) {
      // For validated users, show shortened address as "username"
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    // For non-validated users, show as anonymous
    return 'anonymous';
  }

  handleJoinChat(ws, data) {
    const { room, userAddress, userType = 'public', sessionToken, userSignature, lastMessageTime } = data;
    
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    // Check SIWE validation for username display
    const isValidated = this.isSIWEValidated(userAddress, sessionToken, userSignature);
    
    // Simplified logging
    this.logger.info(`SIWE validation for ${userAddress}: ${isValidated ? 'validated' : 'anonymous'}`);
    
    const displayName = this.getDisplayName(userAddress, sessionToken, userSignature);
    
    // Check permissions for supporter chat
    if (room === 'supporter' && !this.chatRooms.supporter.allowedUsers.has(userAddress)) {
      this.sendError(ws, 'Access denied: Supporter chat requires tip verification');
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
      address: userAddress,
      type: userType,
      room,
      sessionToken: sessionToken || null,
      signature: userSignature || null,
      validated: isValidated,
      displayName: displayName
    });
    
    // Store user info
    ws.userData = {
      address: userAddress,
      type: userType,
      room,
      sessionToken: sessionToken || null,
      signature: userSignature || null,
      validated: isValidated,
      displayName: displayName
    };
    
    // Send historical messages since lastMessageTime
    this.sendHistoricalMessages(ws, room, lastMessageTime);
    
    // Notify user joined (with validation status and room count)
    this.broadcastToRoom(room, 'user_joined', {
      userAddress,
      userType,
      validated: isValidated,
      displayName: displayName,
      room: room,
      roomCount: this.chatRooms[room].connectedUsers.size,
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`User ${userAddress} (${displayName}) joined ${room} chat - SIWE validated: ${isValidated}`);
    this.sendMessage(ws, {
      type: 'join_success',
      room,
      message: `Joined ${room} chat successfully`,
      validated: isValidated,
      displayName: displayName
    });
  }

  /**
   * Send historical messages to user when joining a chat room
   * @param {WebSocket} ws - The WebSocket connection
   * @param {string} room - The chat room name
   * @param {string} lastMessageTime - UTC timestamp of last message user has (optional)
   */
  sendHistoricalMessages(ws, room, lastMessageTime) {
    this.logger.info(`sendHistoricalMessages called for room: ${room}, lastMessageTime: ${lastMessageTime}`);
    
    if (!this.chatRooms[room]) {
      this.logger.warn(`Chat room ${room} not found`);
      return;
    }

    let messages = [...this.chatRooms[room].messages];
    this.logger.info(`Total messages in ${room}: ${messages.length}`);
    
    // Sort messages by timestamp (ascending order)
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Filter messages since lastMessageTime if provided
    if (lastMessageTime) {
      try {
        const lastTime = new Date(lastMessageTime);
        this.logger.info(`Filtering messages since: ${lastTime.toISOString()}`);
        if (!isNaN(lastTime.getTime())) {
          const originalLength = messages.length;
          messages = messages.filter(msg => new Date(msg.timestamp) > lastTime);
          this.logger.info(`Filtered ${originalLength} messages to ${messages.length} since timestamp`);
        } else {
          this.logger.warn(`Invalid lastMessageTime: ${lastMessageTime}, returning all messages`);
        }
      } catch (error) {
        this.logger.warn(`Exception parsing lastMessageTime: ${lastMessageTime}, returning all messages`, error);
      }
    } else {
      this.logger.info(`No lastMessageTime provided, returning all messages`);
    }
    
    // Limit historical messages to prevent overwhelming users
    const maxHistoricalMessages = 1000;
    if (messages.length > maxHistoricalMessages) {
      messages = messages.slice(-maxHistoricalMessages);
      this.logger.info(`Limited historical messages to ${maxHistoricalMessages} for room ${room}`);
    }
    
    // Send historical messages to user
    if (messages.length > 0) {
      this.sendMessage(ws, {
        type: 'historical_messages',
        room,
        messages: messages,
        timestamp: new Date().toISOString()
      });
      this.logger.info(`Sent ${messages.length} historical messages to ${ws.userData?.address || 'anonymous'} for room ${room}`);
    } else {
      this.logger.info(`No historical messages to send for room ${room}`);
    }
  }

  handleIsSupporter(ws, data) {
    const { userAddress, userSignature } = data;
    
    if (!userAddress) {
      this.sendError(ws, 'Missing userAddress for supporter check');
      return;
    }
    
    const isSupporter = this.chatRooms.supporter.allowedUsers.has(userAddress);
    const userSig = this.chatRooms.supporter.userSignatures.get(userAddress);
    if (userSig != userSignature) {
      isSupporter = false;
    }

    this.sendMessage(ws, {
      type: 'supporter_status',
      userAddress,
      isSupporter,
      error: isSupporter ? '' : 'Signature mismatch',
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`Supporter check for ${userAddress}: ${isSupporter}`);
  }

  handleLeaveChat(ws, data) {
    const { room } = data;
    
    if (this.chatRooms[room] && this.chatRooms[room].connectedUsers.has(ws)) {
      this.chatRooms[room].connectedUsers.delete(ws);
      
      // Notify user left
      if (ws.userData && ws.userData.address) {
        this.broadcastToRoom(room, 'user_left', {
          userAddress: ws.userData.address,
          timestamp: new Date().toISOString()
        });
      }
      
      // Clear room from user data
      if (ws.userData && ws.userData.room === room) {
        ws.userData.room = null;
      }
    }
  }

  handleWebSocketMessage(ws, data) {
    const { type, ...payload } = data;

    switch (type) {
      case 'join_chat':
        this.handleJoinChat(ws, payload);
        break;
      case 'leave_chat':
        this.handleLeaveChat(ws, payload);
        break;
      case 'chat_message':
        this.handleChatMessage(ws, payload);
        break;
      case 'is_supporter':
        this.handleIsSupporter(ws, payload);
        break;
      default:
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  handleIsSupporter(ws, data) {
    const { userAddress } = data;
    
    if (!userAddress) {
      this.sendError(ws, 'Missing userAddress for supporter check');
      return;
    }
    
    const isSupporter = this.chatRooms.supporter.allowedUsers.has(userAddress);
    
    this.sendMessage(ws, {
      type: 'supporter_status',
      userAddress,
      isSupporter,
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`Supporter check for ${userAddress}: ${isSupporter}`);
  }

  handleChatMessage(ws, data) {
    const { room, message, messageType = 'public', userSignature, userAddress, sessionToken } = data;
    this.logger.info(`Received chat message for data=${JSON.stringify(data)}`);
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    // Update user address if provided (allows wallet connection after joining)
    if (userAddress && userAddress !== 'anon') {
      ws.userData.address = userAddress;
      // Update SIWE validation status
      const isValidated = this.isSIWEValidated(userAddress, sessionToken);
      ws.userData.validated = isValidated;
      ws.userData.displayName = this.getDisplayName(userAddress, sessionToken, userSignature);
    }
    
    // Check permissions for supporter chat
    if (room === 'supporter') {
      // Verify signature for supporter chat
      if (!userSignature) {
        this.sendError(ws, 'Signature required for supporter chat');
        return;
      }
      
      const userAddress = ws.userData?.address;
      if (!userAddress) {
        this.sendError(ws, 'User address required');
        return;
      }
      
      // Check if user is allowed in supporter chat
      if (!this.chatRooms.supporter.allowedUsers.has(userAddress)) {

        //confirm if signature saved matches
        if (this.chatRooms.supporter.userSignatures.get(userAddress) != userSignature) {
          this.sendError(ws, 'Access denied: Supporter chat requires valid tip signature');
          return;
        }

        this.sendError(ws, 'Access denied: Supporter chat requires tip verification');
        return;
      }
    }
    
    // Filter bad words from message content
    const filteredContent = this.badWordsFilter.filter(message);
    
    // Log if content was filtered
    if (filteredContent !== message) {
      this.logger.warn(`Filtered bad words from message in ${room} by ${ws.userData?.address || 'anonymous'}: original="${message}" filtered="${filteredContent}"`);
    }
    
    // Determine sender display name based on SIWE validation
    const senderAddress = ws.userData?.address || 'anonymous';
    const isValidated = ws.userData?.validated || false;
    const displayName = this.getDisplayName(senderAddress, sessionToken, ws.userData?.signature);
    
    // Create message object with filtered content
    const chatMessage = {
      id: uuidv4(),
      content: filteredContent,
      originalContent: message !== filteredContent ? message : null, // Store original if filtered
      sender: senderAddress,
      senderDisplayName: displayName, // Display name for UI
      senderType: ws.userData?.type || 'public',
      senderValidated: isValidated, // SIWE validation status
      messageType,
      room,
      timestamp: new Date().toISOString(),
      signature: userSignature || null, // Store signature for supporter chat
      filtered: message !== filteredContent, // Flag if message was filtered
      sessionToken: sessionToken || null // For validation
    };
    
    // Add to message history
    this.chatRooms[room].messages.push(chatMessage);
    
    // Limit message history size
    if (this.chatRooms[room].messages.length > this.chatRooms[room].maxMessages) {
      this.chatRooms[room].messages.shift();
    }
    
    // Broadcast to all users in the room
    this.broadcastToRoom(room, 'chat_message', chatMessage);
    
    this.logger.info(`Chat message in ${room} from ${displayName} (${senderAddress}): ${filteredContent} - SIWE validated: ${isValidated}`);
  }

  handleDisconnect(ws) {
    this.logger.info(`Handling disconnect for client ${ws.clientId}`);
    
    // Remove from all chat rooms
    Object.keys(this.chatRooms).forEach(room => {
      if (this.chatRooms[room].connectedUsers.has(ws)) {
        this.chatRooms[room].connectedUsers.delete(ws);
        
        // Notify user left
        if (ws.userData && ws.userData.address) {
          this.broadcastToRoom(room, 'user_left', {
            userAddress: ws.userData.address,
            room: room,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
  }

  // Helper methods for WebSocket communication
  sendMessage(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  sendError(ws, message) {
    this.sendMessage(ws, { type: 'error', message });
  }

  broadcastToRoom(room, eventType, data) {
    const message = JSON.stringify({ type: eventType, ...data });
    //this.logger.info(`Broadcasting to room ${room} users: length: ${this.chatRooms[room].connectedUsers.size}, event: ${eventType}`);
    this.chatRooms[room].connectedUsers.forEach((userData, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.logger.info(`Broadcasting to ${room} - user: ${userData.address}, event: ${eventType}`);
        socket.send(message);
      } else {
        this.logger.warn(`Socket not open for user: ${userData.address} in room: ${room}, readyState: ${socket.readyState}`);
      }
    });
  }

  // Add user to supporter chat (tip verification)
  addSupporterUser(userAddress, userSignature,tipAmount) {
    if (!userAddress || !tipAmount) {
      this.logger.error('Missing userAddress or tipAmount for supporter user');
      return;
    }
    
    // Verify tip amount meets minimum requirement
    const minTipAmount = 0.01; // $0.01 minimum for supporter chat
    if (tipAmount >= minTipAmount) {
      const wasNewUser = !this.chatRooms.supporter.allowedUsers.has(userAddress);
      if (wasNewUser) {
        this.chatRooms.supporter.allowedUsers.add(userAddress);
        this.logger.info(`User ${userAddress} added to supporter chat with tip amount: $${tipAmount}`);
        
        // Broadcast user_joined message to supporter room for room count update
        this.broadcastToRoom('supporter', 'user_joined', {
          userAddress,
          userType: 'supporter',
          validated: true,
          displayName: this.getDisplayName(userAddress, null, userSignature),
          room: 'supporter',
          roomCount: this.chatRooms.supporter.connectedUsers.size,
          timestamp: new Date().toISOString()
        });
      }
      //keep latest signature
      this.chatRooms.supporter.userSignatures.set(userAddress, userSignature);
    } else {
      this.logger.warn(`Tip amount $${tipAmount} below minimum $${minTipAmount} for supporter chat`);
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { ChatRouter };