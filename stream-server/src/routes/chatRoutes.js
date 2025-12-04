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
        maxMessages: 100
      },
      supporter: {
        messages: [],
        connectedUsers: new Map(),
        maxMessages: 100,
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
          messageCount: this.chatRooms.public.messages.length
        },
        supporter: {
          connectedUsers: this.chatRooms.supporter.connectedUsers.size,
          messageCount: this.chatRooms.supporter.messages.length,
          allowedUsers: this.chatRooms.supporter.allowedUsers.size
        }
      };
      res.json({ status });
    });

    // Get messages from a specific room
    this.router.get('/messages/:room', (req, res) => {
      const { room } = req.params;
      if (!this.chatRooms[room]) {
        return res.status(404).json({ error: 'Chat room not found' });
      }
      
      res.json({
        room,
        messages: this.chatRooms[room].messages
      });
    });

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

  handleJoinChat(ws, data) {
    const { room, userAddress, userType = 'public' } = data;
    
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    // Check permissions for supporter chat
    if (room === 'supporter' && !this.chatRooms.supporter.allowedUsers.has(userAddress)) {
      this.sendError(ws, 'Access denied: Supporter chat requires tip verification');
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
      room
    });
    
    // Store user info
    ws.userData = { address: userAddress, type: userType, room };
    
    // Notify user joined
    this.broadcastToRoom(room, 'user_joined', {
      userAddress,
      userType,
      timestamp: new Date().toISOString()
    });
    
    this.logger.info(`User ${userAddress} joined ${room} chat`);
    this.sendMessage(ws, { type: 'join_success', room, message: `Joined ${room} chat successfully` });
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
    const { room, message, messageType = 'public', userSignature, userAddress } = data;
    this.logger.info(`Received chat message for data=${JSON.stringify(data)}`);
    if (!this.chatRooms[room]) {
      this.sendError(ws, 'Invalid chat room');
      return;
    }
    
    // Update user address if provided (allows wallet connection after joining)
    if (userAddress && userAddress !== 'anon') {
      ws.userData.address = userAddress;
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
    
    // Create message object with filtered content
    const chatMessage = {
      id: uuidv4(),
      content: filteredContent,
      originalContent: message !== filteredContent ? message : null, // Store original if filtered
      sender: ws.userData?.address || 'anonymous',
      senderType: ws.userData?.type || 'public',
      messageType,
      room,
      timestamp: new Date().toISOString(),
      signature: signature || null, // Store signature for supporter chat
      filtered: message !== filteredContent // Flag if message was filtered
    };
    
    // Add to message history
    this.chatRooms[room].messages.push(chatMessage);
    
    // Limit message history size
    if (this.chatRooms[room].messages.length > this.chatRooms[room].maxMessages) {
      this.chatRooms[room].messages.shift();
    }
    
    // Broadcast to all users in the room
    this.broadcastToRoom(room, 'chat_message', chatMessage);
    
    this.logger.info(`Chat message in ${room} from ${chatMessage.sender}: ${filteredContent}`);
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
      this.chatRooms.supporter.allowedUsers.add(userAddress);
      this.chatRooms.supporter.userSignatures.set(userAddress, userSignature);
      this.logger.info(`User ${userAddress} added to supporter chat with tip amount: $${tipAmount}`);
    } else {
      this.logger.warn(`Tip amount $${tipAmount} below minimum $${minTipAmount} for supporter chat`);
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { ChatRouter };