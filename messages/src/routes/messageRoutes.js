const express = require('express');
const { v4: uuidv4 } = require('uuid');

class MessageRouter {
  constructor(xmtpHandler, logger) {
    this.xmtpHandler = xmtpHandler;
    this.logger = logger;
    this.router = express.Router();
    this.setupRoutes();
  }

  setupRoutes() {
    // Initialize XMTP client
    this.router.post('/initialize', async (req, res) => {
      try {
        const { privateKey, options } = req.body;
        
        if (!privateKey) {
          return res.status(400).json({
            error: 'Private key is required',
            message: 'XMTP initialization requires a valid Ethereum private key'
          });
        }

        const result = await this.xmtpHandler.initialize(privateKey, options);
        
        res.json({
          success: true,
          message: 'XMTP client initialized successfully',
          address: await this.xmtpHandler.getAddress(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to initialize XMTP client:', error);
        res.status(500).json({
          error: 'Initialization failed',
          message: error.message
        });
      }
    });

    // Send message to single address
    this.router.post('/send', async (req, res) => {
      try {
        const { peerAddress, content, messageType } = req.body;
        
        if (!peerAddress || !content) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'peerAddress and content are required'
          });
        }

        const result = await this.xmtpHandler.sendMessage(peerAddress, content, messageType);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to send message:', error);
        res.status(500).json({
          error: 'Message send failed',
          message: error.message
        });
      }
    });

    // Broadcast message to multiple addresses
    this.router.post('/broadcast', async (req, res) => {
      try {
        const { addresses, content, messageType } = req.body;
        
        if (!addresses || !content) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'addresses array and content are required'
          });
        }

        if (!Array.isArray(addresses) || addresses.length === 0) {
          return res.status(400).json({
            error: 'Invalid addresses',
            message: 'addresses must be a non-empty array'
          });
        }

        const results = await this.xmtpHandler.broadcastMessage(addresses, content, messageType);
        
        res.json({
          success: true,
          results,
          summary: {
            total: addresses.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to broadcast message:', error);
        res.status(500).json({
          error: 'Broadcast failed',
          message: error.message
        });
      }
    });

    // Public chat with moderation
    this.router.post('/public-chat', async (req, res) => {
      try {
        const { content, metadata } = req.body;
        
        if (!content) {
          return res.status(400).json({
            error: 'Missing content',
            message: 'content is required for public chat'
          });
        }

        const result = await this.xmtpHandler.sendPublicChat(content, metadata);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to send public chat:', error);
        res.status(500).json({
          error: 'Public chat failed',
          message: error.message
        });
      }
    });

    // Enhanced DM functionality
    this.router.post('/dm', async (req, res) => {
      try {
        const { peerAddress, content, metadata } = req.body;
        
        if (!peerAddress || !content) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'peerAddress and content are required for DM'
          });
        }

        const result = await this.xmtpHandler.sendDM(peerAddress, content, metadata);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to send DM:', error);
        res.status(500).json({
          error: 'DM failed',
          message: error.message
        });
      }
    });

    // Super chat with tip payment verification
    this.router.post('/super-chat', async (req, res) => {
      try {
        const { content, tipAmount, paymentVerification } = req.body;
        
        if (!content || !tipAmount) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'content and tipAmount are required for super chat'
          });
        }

        const result = await this.xmtpHandler.sendSuperChat(content, tipAmount, paymentVerification);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to send super chat:', error);
        res.status(500).json({
          error: 'Super chat failed',
          message: error.message
        });
      }
    });

    // Director chat functionality
    this.router.post('/director-chat', async (req, res) => {
      try {
        const { content, directorAuth } = req.body;
        
        if (!content) {
          return res.status(400).json({
            error: 'Missing content',
            message: 'content is required for director chat'
          });
        }

        const result = await this.xmtpHandler.sendDirectorChat(content, directorAuth);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to send director chat:', error);
        res.status(500).json({
          error: 'Director chat failed',
          message: error.message
        });
      }
    });

    // Message moderation endpoint
    this.router.post('/moderate', async (req, res) => {
      try {
        const { messageId, action, moderator } = req.body;
        
        if (!messageId || !action) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'messageId and action are required for moderation'
          });
        }

        const result = await this.xmtpHandler.moderateMessage(messageId, action, moderator);
        
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to moderate message:', error);
        res.status(500).json({
          error: 'Moderation failed',
          message: error.message
        });
      }
    });

    // Start listening for incoming messages
    this.router.post('/listen/start', async (req, res) => {
      try {
        const { webhookUrl, handler } = req.body;
        
        const messageHandler = async (messageData) => {
          if (webhookUrl) {
            try {
              // Send webhook notification
              const axios = require('axios');
              await axios.post(webhookUrl, {
                type: 'xmtp_message',
                data: messageData,
                timestamp: new Date().toISOString()
              });
            } catch (webhookError) {
              this.logger.error('Failed to send webhook:', webhookError);
            }
          }
          
          if (handler) {
            // Execute custom handler function
            try {
              eval(handler)(messageData);
            } catch (handlerError) {
              this.logger.error('Failed to execute custom handler:', handlerError);
            }
          }
        };

        await this.xmtpHandler.startListening(messageHandler);
        
        res.json({
          success: true,
          message: 'Started listening for messages',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to start listening:', error);
        res.status(500).json({
          error: 'Listen start failed',
          message: error.message
        });
      }
    });

    // Stop listening for messages
    this.router.post('/listen/stop', async (req, res) => {
      try {
        await this.xmtpHandler.close();
        
        res.json({
          success: true,
          message: 'Stopped listening for messages',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to stop listening:', error);
        res.status(500).json({
          error: 'Listen stop failed',
          message: error.message
        });
      }
    });

    // Get all conversations
    this.router.get('/conversations', async (req, res) => {
      try {
        const conversations = await this.xmtpHandler.getConversations();
        
        res.json({
          success: true,
          conversations,
          count: conversations.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to get conversations:', error);
        res.status(500).json({
          error: 'Get conversations failed',
          message: error.message
        });
      }
    });

    // Get messages from specific conversation
    this.router.get('/messages/:peerAddress', async (req, res) => {
      try {
        const { peerAddress } = req.params;
        const { limit } = req.query;
        
        const messages = await this.xmtpHandler.getMessages(peerAddress, parseInt(limit) || 50);
        
        res.json({
          success: true,
          peerAddress,
          messages,
          count: messages.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to get messages:', error);
        res.status(500).json({
          error: 'Get messages failed',
          message: error.message
        });
      }
    });

    // Check if address can receive messages
    this.router.get('/can-message/:address', async (req, res) => {
      try {
        const { address } = req.params;
        
        const canMessage = await this.xmtpHandler.canMessage(address);
        
        res.json({
          success: true,
          address,
          canMessage,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to check can message:', error);
        res.status(500).json({
          error: 'Can message check failed',
          message: error.message
        });
      }
    });

    // Get client address
    this.router.get('/address', async (req, res) => {
      try {
        const address = await this.xmtpHandler.getAddress();
        
        res.json({
          success: true,
          address,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to get client address:', error);
        res.status(500).json({
          error: 'Get address failed',
          message: error.message
        });
      }
    });

    // Get client status
    this.router.get('/status', (req, res) => {
      try {
        const status = this.xmtpHandler.getStatus();
        
        res.json({
          success: true,
          status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to get status:', error);
        res.status(500).json({
          error: 'Get status failed',
          message: error.message
        });
      }
    });

    // Health check for XMTP connection
    this.router.get('/health', async (req, res) => {
      try {
        const status = this.xmtpHandler.getStatus();
        
        res.json({
          status: 'healthy',
          xmtp: {
            initialized: status.initialized,
            environment: status.environment,
            address: status.hasClient ? await this.xmtpHandler.getAddress() : null
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Create conversation
    this.router.post('/conversation', async (req, res) => {
      try {
        const { peerAddress } = req.body;
        
        if (!peerAddress) {
          return res.status(400).json({
            error: 'Missing peerAddress',
            message: 'peerAddress is required'
          });
        }

        const conversation = await this.xmtpHandler.createConversation(peerAddress);
        
        res.json({
          success: true,
          conversation,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to create conversation:', error);
        res.status(500).json({
          error: 'Create conversation failed',
          message: error.message
        });
      }
    });
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { MessageRouter };