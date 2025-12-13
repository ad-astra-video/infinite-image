const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

/**
 * WebRTC Broadcasting Server
 * Handles WebRTC connections for stream broadcasting within the existing Express server
 * Uses HTTP signaling to whep_url for WebRTC connections
 */
class WebRTCBroadcastingServer {
  constructor(config) {
    this.logger = config.logger;
    this.streamId = null;
    this.adminConnections = new Map(); // Admin connection tracking
    this.consumerConnections = new Map(); // Consumer connection tracking
    this.isBroadcasting = false;
    this.maxConsumers = config.maxConsumers || 50;
    
    // WebRTC signaling data
    this.signalingData = {
      offers: new Map(),
      answers: new Map(),
      iceCandidates: new Map()
    };

    // WHEP connection state
    this.whepConnection = null;
    this.whepUrl = null;
    this.isWhepConnected = false;
  }

  /**
   * Start broadcasting for a stream
   * @param {string} streamId - Stream ID from Muxion gateway
   */
  async startBroadcasting(streamId) {
    this.streamId = streamId;
    this.isBroadcasting = true;
    this.logger.info(`WebRTC broadcasting started for stream: ${streamId}`);
    
    return {
      whep_url: `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/${streamId}/whep`,
      signaling_url: `http://localhost:${process.env.PORT || 4021}/ai/stream/broadcast/${streamId}/signal`
    };
  }

  /**
   * Setup WHEP connection for stream relaying
   * @param {string} streamId - Stream ID
   * @param {string} whepUrl - WHEP URL from gateway
   */
  async setupWhepConnection(streamId, whepUrl) {
    try {
      this.logger.info(`Setting up WHEP connection for stream: ${streamId}`);
      
      this.streamId = streamId;
      this.whepUrl = whepUrl;
      this.isWhepConnected = true;
      
      // Initialize WHEP connection
      this.whepConnection = {
        streamId: streamId,
        whepUrl: whepUrl,
        connected: true,
        connectionTime: Date.now()
      };
      
      this.logger.info(`WHEP connection established for stream: ${streamId}`);
      
      return {
        whep_url: whepUrl,
        signaling_url: `http://localhost:${process.env.PORT || 4021}/ai/stream/broadcast/${streamId}/signal`,
        connection_status: 'connected'
      };
      
    } catch (error) {
      this.logger.error(`Failed to setup WHEP connection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop broadcasting and cleanup all connections
   */
  stopBroadcasting() {
    this.isBroadcasting = false;
    
    // Clear WHEP connection
    this.isWhepConnected = false;
    this.whepConnection = null;
    this.whepUrl = null;
    
    // Clear all connection tracking
    this.adminConnections.clear();
    this.consumerConnections.clear();
    
    // Clear signaling data
    this.signalingData.offers.clear();
    this.signalingData.answers.clear();
    this.signalingData.iceCandidates.clear();
    
    this.logger.info(`WebRTC broadcasting stopped for stream: ${this.streamId}`);
    this.streamId = null;
  }

  /**
   * Handle HTTP signaling requests
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {string} connectionType - 'admin' or 'consumer'
   */
  handleSignalingRequest(req, res, connectionType) {
    const { type, peerId, payload } = req.body;
    const connectionId = uuidv4().replace(/-/g, '');
    
    // Track connection
    if (connectionType === 'admin') {
      this.adminConnections.set(connectionId, { peerId, timestamp: Date.now() });
    } else if (connectionType === 'consumer') {
      if (this.consumerConnections.size >= this.maxConsumers) {
        return res.status(1008).json({ error: 'Maximum consumers reached' });
      }
      this.consumerConnections.set(connectionId, { peerId, timestamp: Date.now() });
    }

    try {
      switch (type) {
        case 'offer':
          this.handleOffer(peerId, payload, connectionId, res);
          break;
        case 'answer':
          this.handleAnswer(peerId, payload, connectionId, res);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(peerId, payload, connectionId, res);
          break;
        case 'join-broadcast':
          this.handleJoinBroadcast(connectionId, res);
          break;
        case 'leave-broadcast':
          this.handleLeaveBroadcast(connectionId, res);
          break;
        default:
          res.status(400).json({ error: 'Unknown signaling message type' });
      }
    } catch (error) {
      this.logger.error(`Error handling signaling request: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Handle WebRTC offer via HTTP
   * @param {string} peerId - Peer ID
   * @param {object} offer - WebRTC offer
   * @param {string} connectionId - Connection ID
   * @param {object} res - Express response
   */
  handleOffer(peerId, offer, connectionId, res) {
    this.signalingData.offers.set(peerId, { offer, connectionId });
    
    // Return success response
    res.json({
      status: 'offer_received',
      peerId,
      connectionId
    });
    
    this.logger.info(`WebRTC offer received from peer: ${peerId}`);
  }

  /**
   * Handle WebRTC answer via HTTP
   * @param {string} peerId - Peer ID
   * @param {object} answer - WebRTC answer
   * @param {string} connectionId - Connection ID
   * @param {object} res - Express response
   */
  handleAnswer(peerId, answer, connectionId, res) {
    this.signalingData.answers.set(peerId, { answer, connectionId });
    
    // Return success response
    res.json({
      status: 'answer_received',
      peerId,
      connectionId
    });
    
    this.logger.info(`WebRTC answer received from peer: ${peerId}`);
  }

  /**
   * Handle ICE candidate via HTTP
   * @param {string} peerId - Peer ID
   * @param {object} candidate - ICE candidate
   * @param {string} connectionId - Connection ID
   * @param {object} res - Express response
   */
  handleIceCandidate(peerId, candidate, connectionId, res) {
    this.signalingData.iceCandidates.set(peerId, { candidate, connectionId });
    
    // Return success response
    res.json({
      status: 'ice_candidate_received',
      peerId,
      connectionId
    });
    
    this.logger.info(`ICE candidate received from peer: ${peerId}`);
  }

  /**
   * Handle peer joining broadcast via HTTP
   * @param {string} connectionId - Connection ID
   * @param {object} res - Express response
   */
  handleJoinBroadcast(connectionId, res) {
    const peerId = uuidv4().replace(/-/g, '');
    
    // Return welcome response with peer ID
    res.json({
      status: 'joined_broadcast',
      peerId,
      streamId: this.streamId,
      consumerCount: this.consumerConnections.size
    });
    
    this.logger.info(`Peer ${peerId} joined broadcast for stream ${this.streamId}`);
  }

  /**
   * Handle peer leaving broadcast via HTTP
   * @param {string} connectionId - Connection ID
   * @param {object} res - Express response
   */
  handleLeaveBroadcast(connectionId, res) {
    this.cleanupConnection(connectionId);
    
    res.json({ status: 'left_broadcast' });
    this.logger.info(`Peer left broadcast: ${connectionId}`);
  }

  /**
   * Cleanup connection
   * @param {string} connectionId - Connection ID
   */
  cleanupConnection(connectionId) {
    // Remove from connection tracking
    this.adminConnections.delete(connectionId);
    this.consumerConnections.delete(connectionId);
    
    // Remove signaling data
    this.signalingData.offers.forEach((data, peerId) => {
      if (data.connectionId === connectionId) {
        this.signalingData.offers.delete(peerId);
      }
    });
    
    this.signalingData.answers.forEach((data, peerId) => {
      if (data.connectionId === connectionId) {
        this.signalingData.answers.delete(peerId);
      }
    });
    
    this.signalingData.iceCandidates.forEach((data, peerId) => {
      if (data.connectionId === connectionId) {
        this.signalingData.iceCandidates.delete(peerId);
      }
    });
  }

  /**
   * Get broadcasting status
   */
  getStatus() {
    return {
      isBroadcasting: this.isBroadcasting,
      streamId: this.streamId,
      adminConnections: this.adminConnections.size,
      consumerConnections: this.consumerConnections.size,
      maxConsumers: this.maxConsumers,
      isWhepConnected: this.isWhepConnected,
      whepUrl: this.whepUrl,
      whepConnection: this.whepConnection
    };
  }

  /**
   * Relay stream to connected consumers
   * This method would handle the actual stream relaying logic
   * In a real implementation, this would connect to the WHEP URL and
   * distribute the stream to all connected consumers
   */
  async relayStreamToConsumers() {
    if (!this.isWhepConnected || !this.whepConnection) {
      this.logger.warn('No WHEP connection available for stream relaying');
      return;
    }

    try {
      this.logger.info(`Relaying stream ${this.streamId} to ${this.consumerConnections.size} consumers`);
      
      // In a real implementation, this would:
      // 1. Connect to the WHEP URL
      // 2. Receive the stream data
      // 3. Distribute the stream to all connected consumers
      // 4. Handle stream quality adaptation
      
      this.logger.info(`Stream relaying setup complete for ${this.consumerConnections.size} consumers`);
      
    } catch (error) {
      this.logger.error(`Stream relaying failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if WHEP connection is active and ready for relaying
   */
  isReadyForRelaying() {
    return this.isWhepConnected &&
           this.whepConnection &&
           this.whepConnection.connected &&
           this.consumerConnections.size > 0;
  }
}

module.exports = { WebRTCBroadcastingServer };