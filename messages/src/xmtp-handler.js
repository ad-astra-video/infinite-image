const { Client } = require('@xmtp/node-sdk');
const { ethers } = require('ethers');

class XMTPMessages {
  constructor(config) {
    this.logger = config.logger;
    this.environment = config.environment || 'production';
    this.appName = config.appName || 'x402-gateway';
    this.appVersion = config.appVersion || '1.0.0';
    this.client = null;
    this.isInitialized = false;
    this.messageHandlers = new Map();
    this.conversations = new Map();
    
    this.MessageType = {
      TEXT: 'text',
      EMOJI: 'emoji',
      IMAGE: 'image',
      FILE: 'file',
      SYSTEM: 'system',
      PUBLIC_CHAT: 'public_chat',
      DM: 'dm',
      SUPER_CHAT: 'super_chat',
      DIRECTOR_CHAT: 'director_chat'
    };
  }

  async initialize(privateKey, options = {}) {
    try {
      if (!privateKey) {
        throw new Error('Private key is required for XMTP initialization');
      }

      const wallet = new ethers.Wallet(privateKey);
      
      // Create signer for the XMTP Node SDK
      this.client = await Client.createFromSigner(wallet, {
        env: this.environment,
        appName: this.appName,
        appVersion: this.appVersion,
        ...options
      });

      this.isInitialized = true;
      this.logger.info('XMTP client initialized successfully', {
        address: wallet.address,
        environment: this.environment
      });

      return this.client;
    } catch (error) {
      this.logger.error('Failed to initialize XMTP client:', error);
      throw error;
    }
  }

  async createConversation(peerAddress) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      // Use the Node SDK's conversation creation
      const conversation = await this.client.conversations.newConversation(peerAddress);
      this.conversations.set(peerAddress, conversation);
      this.logger.info('Created conversation with:', peerAddress);
      return conversation;
    } catch (error) {
      this.logger.error('Failed to create conversation with:', peerAddress, error);
      throw error;
    }
  }

  async sendMessage(peerAddress, content, messageType = this.MessageType.TEXT) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const conversation = await this.createConversation(peerAddress);
      
      const messageContent = {
        type: messageType,
        content: content,
        timestamp: new Date().toISOString(),
        sender: await this.getAddress(),
        id: require('uuid').v4()
      };

      // Send as text message using the Node SDK
      const result = await conversation.send(JSON.stringify(messageContent));
      
      this.logger.info('Message sent successfully', {
        to: peerAddress,
        type: messageType,
        id: messageContent.id
      });

      return {
        success: true,
        messageId: messageContent.id,
        conversationId: conversation.peerAddress,
        timestamp: messageContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  async broadcastMessage(addresses, content, messageType = this.MessageType.TEXT) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses array is required for broadcasting');
    }

    const results = [];
    
    for (const address of addresses) {
      try {
        const result = await this.sendMessage(address, content, messageType);
        results.push({ address, ...result });
      } catch (error) {
        this.logger.error(`Failed to broadcast to ${address}:`, error);
        results.push({
          address,
          success: false,
          error: error.message
        });
      }
    }

    this.logger.info('Broadcast completed', {
      total: addresses.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  // Public chat with moderation capabilities
  async sendPublicChat(content, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const messageContent = {
        type: this.MessageType.PUBLIC_CHAT,
        content: content,
        timestamp: new Date().toISOString(),
        sender: this.client.address,
        id: require('uuid').v4(),
        metadata: {
          moderationStatus: 'pending',
          ...metadata
        }
      };

      // Send to a public broadcast address (e.g., all users)
      const result = await this.broadcastToAll(content, messageContent);
      
      this.logger.info('Public chat message sent', {
        content: content.substring(0, 50),
        id: messageContent.id
      });

      return {
        success: true,
        messageId: messageContent.id,
        type: this.MessageType.PUBLIC_CHAT,
        timestamp: messageContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to send public chat message:', error);
      throw error;
    }
  }

  // DM functionality with enhanced features
  async sendDM(peerAddress, content, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const messageContent = {
        type: this.MessageType.DM,
        content: content,
        timestamp: new Date().toISOString(),
        sender: this.client.address,
        id: require('uuid').v4(),
        metadata: {
          isEncrypted: true,
          ...metadata
        }
      };

      const conversation = await this.createConversation(peerAddress);
      const result = await conversation.send(JSON.stringify(messageContent));
      
      this.logger.info('DM sent successfully', {
        to: peerAddress,
        content: content.substring(0, 50),
        id: messageContent.id
      });

      return {
        success: true,
        messageId: messageContent.id,
        conversationId: conversation.peerAddress,
        type: this.MessageType.DM,
        timestamp: messageContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to send DM:', error);
      throw error;
    }
  }

  // Super chat with tip payment verification
  async sendSuperChat(content, tipAmount, paymentVerification = {}) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const messageContent = {
        type: this.MessageType.SUPER_CHAT,
        content: content,
        timestamp: new Date().toISOString(),
        sender: this.client.address,
        id: require('uuid').v4(),
        tip: {
          amount: tipAmount,
          verified: !!paymentVerification.txHash,
          txHash: paymentVerification.txHash || null,
          currency: paymentVerification.currency || 'USDC'
        },
        metadata: {
          paymentVerified: !!paymentVerification.txHash,
          ...paymentVerification
        }
      };

      // Send as broadcast to all viewers
      const result = await this.broadcastToAll(content, messageContent);
      
      this.logger.info('Super chat sent', {
        content: content.substring(0, 50),
        tipAmount,
        verified: !!paymentVerification.txHash,
        id: messageContent.id
      });

      return {
        success: true,
        messageId: messageContent.id,
        type: this.MessageType.SUPER_CHAT,
        tip: messageContent.tip,
        timestamp: messageContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to send super chat:', error);
      throw error;
    }
  }

  // Director chat functionality
  async sendDirectorChat(content, directorAuth = {}) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const messageContent = {
        type: this.MessageType.DIRECTOR_CHAT,
        content: content,
        timestamp: new Date().toISOString(),
        sender: this.client.address,
        id: require('uuid').v4(),
        director: {
          authenticated: !!directorAuth.directorId,
          directorId: directorAuth.directorId || null,
          permissions: directorAuth.permissions || ['broadcast']
        },
        metadata: {
          priority: 'high',
          directorOnly: true,
          ...directorAuth
        }
      };

      // Send to director channel (authenticated viewers only)
      const result = await this.broadcastToDirectors(content, messageContent);
      
      this.logger.info('Director chat sent', {
        content: content.substring(0, 50),
        authenticated: !!directorAuth.directorId,
        id: messageContent.id
      });

      return {
        success: true,
        messageId: messageContent.id,
        type: this.MessageType.DIRECTOR_CHAT,
        director: messageContent.director,
        timestamp: messageContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to send director chat:', error);
      throw error;
    }
  }

  // Helper method for broadcasting to all users
  async broadcastToAll(content, messageContent) {
    // This would typically broadcast to a predefined list of addresses
    // For now, we'll use a mock implementation
    const allUsers = await this.getAllUserAddresses();
    return this.broadcastMessage(allUsers, content, messageContent.type);
  }

  // Helper method for broadcasting to directors only
  async broadcastToDirectors(content, messageContent) {
    // This would typically broadcast to authenticated director addresses
    const directorAddresses = await this.getDirectorAddresses();
    return this.broadcastMessage(directorAddresses, content, messageContent.type);
  }

  // Mock method to get all user addresses (would be implemented with actual user database)
  async getAllUserAddresses() {
    // Placeholder implementation - would integrate with user management system
    return [];
  }

  // Mock method to get director addresses (would be implemented with director management system)
  async getDirectorAddresses() {
    // Placeholder implementation - would integrate with director authentication system
    return [];
  }

  // Enhanced moderation system
  async moderateMessage(messageId, action, moderator = {}) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const moderationContent = {
        type: this.MessageType.SYSTEM,
        content: `Moderation action: ${action} on message ${messageId}`,
        timestamp: new Date().toISOString(),
        sender: this.client.address,
        id: require('uuid').v4(),
        moderation: {
          targetMessageId: messageId,
          action: action, // 'approve', 'reject', 'ban', 'timeout'
          moderator: {
            address: moderator.address || this.client.address,
            role: moderator.role || 'moderator'
          }
        }
      };

      // Broadcast moderation notice to all users
      const result = await this.broadcastToAll('Moderation action applied', moderationContent);
      
      this.logger.info('Message moderated', {
        messageId,
        action,
        moderator: moderator.address || this.client.address
      });

      return {
        success: true,
        moderationId: moderationContent.id,
        action,
        timestamp: moderationContent.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to moderate message:', error);
      throw error;
    }
  }

  async startListening(messageHandler) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      // Use the Node SDK's streaming method
      const stream = await this.client.conversations.streamAllMessages(async (message) => {
        try {
          let content;
          try {
            content = JSON.parse(message.content);
          } catch {
            content = {
              type: this.MessageType.TEXT,
              content: message.content,
              timestamp: new Date().toISOString(),
              sender: message.senderInboxId,
              id: message.id
            };
          }

          const handler = this.messageHandlers.get('default');
          if (handler) {
            await handler({
              id: message.id,
              content,
              sender: message.senderInboxId,
              timestamp: message.sentAt,
              conversation: message.conversation
            });
          }
        } catch (error) {
          this.logger.error('Error processing incoming message:', error);
        }
      });
      
      this.messageHandlers.set('default', messageHandler);
      this.logger.info('Started listening for messages');
    } catch (error) {
      this.logger.error('Failed to start message listening:', error);
      throw error;
    }
  }

  async getConversations() {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      // Use the new SDK's conversations listing method
      const conversations = await this.client.conversations.list();
      return conversations;
    } catch (error) {
      this.logger.error('Failed to get conversations:', error);
      throw error;
    }
  }

  async getMessages(peerAddress, limit = 50) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      const conversation = await this.createConversation(peerAddress);
      // Use the Node SDK's messages() method
      const messages = await conversation.messages();
      
      return messages.slice(-limit);
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      throw error;
    }
  }

  async canMessage(address) {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    try {
      return await this.client.canMessage(address);
    } catch (error) {
      this.logger.error('Failed to check if address can message:', error);
      throw error;
    }
  }

  async getAddress() {
    if (!this.isInitialized) {
      throw new Error('XMTP client not initialized. Call initialize() first.');
    }

    return this.client.address;
  }

  async close() {
    try {
      if (this.client) {
        this.messageHandlers.clear();
        this.conversations.clear();
        this.isInitialized = false;
        this.logger.info('XMTP client closed successfully');
      }
    } catch (error) {
      this.logger.error('Error closing XMTP client:', error);
    }
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      environment: this.environment,
      appName: this.appName,
      appVersion: this.appVersion,
      hasClient: !!this.client,
      activeHandlers: this.messageHandlers.size,
      activeConversations: this.conversations.size
    };
  }
}

module.exports = { XMTPMessages };