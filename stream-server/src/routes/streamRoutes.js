const express = require('express');
const { paymentMiddleware } = require('x402-express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { WebRTCBroadcastingServer } = require('../webrtc/broadcasting-server');
const { sessionMiddleware, validateSession } = require('../auth/ironSessionConfig');
const WebSocket = require('ws');

class StreamRouter {
  constructor(config) {
    this.logger = config.logger;
    this.depositAddress = config.depositAddress;
    this.depositPrivateKey = config.depositPrivateKey;
    this.facilitatorUrl = config.facilitatorUrl;
    this.network = config.network || "base-sepolia";
    this.router = express.Router();
    this.streamRunning = false;
    this.streamUrls = {};
    this.streamId = null;
    this.streamControlIds = {};
    this.nextControlStart = 0;
    
    // WebRTC Broadcasting integration
    this.webRTCBroadcasting = new WebRTCBroadcastingServer(config);
    this.streamSettings = new Map(); // Store stream configuration
    
    this.setupRoutes();
  }

  setupRoutes() {
    // Apply session middleware to all routes
    this.router.use(sessionMiddleware);

    // Creator address authentication middleware
    const creatorAuthMiddleware = async (req, res, next) => {
      try {
        // First validate the session
        await validateSession(req, res, () => {});
        if (res.headersSent) return; // Session validation failed and response sent

        const creatorAddress = process.env.CREATOR_ADDRESS;
        
        if (!creatorAddress) {
          this.logger.error('CREATOR_ADDRESS not configured');
          return res.status(500).json({ error: 'Server configuration error' });
        }

        // Get address from authenticated session
        const address = req.session.address;
        
        if (!address) {
          this.logger.warn('Creator authentication failed: No address in session');
          return res.status(401).json({
            error: 'Creator address required',
            message: 'Please authenticate with a valid creator address'
          });
        }

        // Normalize addresses for comparison (lowercase)
        const normalizedAddress = address.toLowerCase();
        const normalizedCreatorAddress = creatorAddress.toLowerCase();

        if (normalizedAddress !== normalizedCreatorAddress) {
          this.logger.warn(`Creator authentication failed: ${address} does not match CREATOR_ADDRESS`);
          return res.status(403).json({
            error: 'Unauthorized',
            message: 'Only the configured creator address can access this endpoint'
          });
        }

        // Authentication successful
        this.logger.info(`Creator authentication successful for: ${address}`);
        next();
      } catch (error) {
        this.logger.error('Creator authentication middleware error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Failed to validate creator authentication'
        });
      }
    };

    // Stream URL endpoint (public access)
    this.router.get('/url', (req, res) => {
      if (!this.streamRunning) {
        return res.json({
          stream: {
            status: "not_running",
            whep_url: null
          }
        });
      }

      let whepUrl = this.streamUrls.whep_url;
      if (!whepUrl && this.streamUrls.stream_id) {
        const GATEWAY_URL = process.env.GATEWAY_URL || "https://gateway.muxion.video";
        whepUrl = `${GATEWAY_URL.replace('gateway', 'stream')}/whep/${this.streamUrls.stream_id}`;
      }

      res.json({
        stream: {
          status: "running",
          whep_url: whepUrl,
          stream_id: this.streamUrls.stream_id,
          playback_url: this.streamUrls.playback_url
        }
      });
    });

    // Start stream endpoint (creator auth required)
    this.router.post('/start', creatorAuthMiddleware, async (req, res) => {
      try {
        const result = await this.startStream(req);
        res.json(result);
      } catch (error) {
        this.logger.error(`Start stream endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Update stream endpoint (creator auth required)
    this.router.post('/update', creatorAuthMiddleware, async (req, res) => {
      try {
        const result = await this.updateStream(req.body);
        res.json(result);
      } catch (error) {
        this.logger.error(`Update stream endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop stream endpoint (creator auth required)
    this.router.post('/stop', creatorAuthMiddleware, async (req, res) => {
      try {
        const result = await this.stopStream(req);
        res.json(result);
      } catch (error) {
        this.logger.error(`Stop stream endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Stream control endpoint
    this.router.post('/control', (req, res) => {
      try {
        const { controlMinutes } = req.body;
        if (!controlMinutes) {
          throw new Error("Missing controlMinutes");
        }
        
        const controlId = this.setupStreamControl(req, controlMinutes);
        res.json({ control_id: controlId });
      } catch (error) {
        this.logger.error(`Stream control endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Stream status endpoint
    this.router.get('/status', (req, res) => {
      try {
        res.json({
          running: this.streamRunning,
          stream_id: this.streamId,
          urls: this.streamUrls,
          broadcasting: this.webRTCBroadcasting.getStatus()
        });
      } catch (error) {
        this.logger.error(`Stream status endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // WebRTC signaling endpoints
    this.router.post('/broadcast/:streamId/admin/signal', (req, res) => {
      try {
        this.webRTCBroadcasting.handleSignalingRequest(req, res, 'admin');
      } catch (error) {
        this.logger.error(`Admin signaling endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/broadcast/:streamId/consumer/signal', (req, res) => {
      try {
        this.webRTCBroadcasting.handleSignalingRequest(req, res, 'consumer');
      } catch (error) {
        this.logger.error(`Consumer signaling endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Admin authentication endpoint
    this.router.post('/admin/check', (req, res) => {
      try {
        const { address } = req.body;
        const creatorAddress = process.env.CREATOR_ADDRESS;
        
        if (!creatorAddress) {
          this.logger.error('CREATOR_ADDRESS not configured');
          return res.status(500).json({ error: 'Admin configuration error' });
        }
        
        const isAdmin = address && address.toLowerCase() === creatorAddress.toLowerCase();
        
        this.logger.info(`Admin check for ${address}: ${isAdmin ? 'authorized' : 'unauthorized'}`);
        res.json({ isAdmin });
      } catch (error) {
        this.logger.error(`Admin check endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async startStream(req = null) {
    try {
      // Handle both file-based and direct request-based stream starts
      let streamRequest;
      let livepeerHdr;
      
      if (req) {
        // Direct request-based stream start (from admin panel)
        const { height, width, rtmp_output, iframe_html, ...dynamicParams } = req.body;
        
        // Required fields validation
        if (!height || !width) {
          throw new Error("Height and Width are required fields");
        }
        
        if (!rtmp_output) {
          throw new Error("At least one RTMP URL is required");
        }
        
        // Store stream settings for iframe HTML
        this.streamSettings.set('iframe_html', iframe_html || '');
        
        // Build stream request with all parameters
        streamRequest = {
          rtmp_output: rtmp_output,
          params: JSON.stringify({ height, width, ...dynamicParams })
        };

        const reqParams = {
          enable_video_ingress: false,
          enable_video_egress: true,
          enable_data_output: false
        }
        
        // Create livepeer header for direct requests
        livepeerHdr = {
          capability: dynamicParams["capability_name"],
          request: JSON.stringify({}),
          parameters: JSON.stringify(reqParams),
          timeout_seconds: 120
        };
      } else {
        // File-based stream start (legacy method)
        const startReq = JSON.parse(fs.readFileSync("start_request.json", 'utf8'));
        streamRequest = startReq.stream_request;
        livepeerHdr = startReq.header;
        livepeerHdr.request = JSON.stringify(startReq.request);
        livepeerHdr.parameters = JSON.stringify(startReq.parameters);
      }

      const startResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/start`,
        streamRequest,
        {
          headers: {
            "Livepeer": Buffer.from(JSON.stringify(livepeerHdr)).toString("base64"),
            "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}`
          }
        }
      );

      if (startResp.status !== 200) {
        this.logger.error(`Failed to start stream: ${startResp.status} ${startResp.data}`);
        throw new Error("Failed to start stream");
      }

      this.streamUrls = startResp.data;
      this.streamId = this.streamUrls.stream_id;
      this.streamRunning = true;
      
      // Start WebRTC broadcasting
      const broadcastConfig = await this.webRTCBroadcasting.startBroadcasting(this.streamId);
      
      this.logger.info("Stream started with WebRTC broadcasting");
      
      return {
        stream: {
          status: "running",
          ...broadcastConfig,
          stream_id: this.streamId,
          urls: this.streamUrls
        }
      };
    } catch (error) {
      this.logger.error(`Start stream failed: ${error.message}`);
      throw error;
    }
  }

  async updateStream(req) {
    // EXCLUDE required fields - allow all other parameters to be updated
    const requiredFields = ['height', 'width', 'rtmp_outputs', 'iframe_html'];
    const allowedParams = Object.keys(req).filter(key => !requiredFields.includes(key));
    
    if (allowedParams.length === 0) {
      throw new Error("No updatable parameters provided");
    }
    
    // Build filtered update request
    const filteredParams = allowedParams.reduce((obj, key) => {
      obj[key] = req[key];
      return obj;
    }, {});
    
    try {
      const updateResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${this.streamId}/update`,
        { params: filteredParams },
        { headers: { "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}` } }
      );

      if (updateResp.status !== 200) {
        this.logger.error(`Failed to update stream: ${updateResp.status} ${updateResp.data}`);
        throw new Error("Failed to update stream");
      }

      this.logger.info(`Stream updated with parameters: ${allowedParams.join(', ')}`);
      return {
        stream: {
          status: "updated"
        }
      };
    } catch (error) {
      this.logger.error(`Update stream failed: ${error.message}`);
      throw error;
    }
  }

  async stopStream(req = null) {
    try {
      if (!this.streamRunning || !this.streamId) {
        throw new Error("No active stream to stop");
      }

      const stopResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${this.streamId}/stop`,
        {},
        {
          headers: {
            "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}`
          }
        }
      );

      if (stopResp.status !== 200) {
        this.logger.error(`Failed to stop stream: ${stopResp.status} ${stopResp.data}`);
        throw new Error("Failed to stop stream");
      }

      // Clean up local state
      this.streamRunning = false;
      this.streamId = null;
      this.streamUrls = {};
      
      // Stop WebRTC broadcasting
      this.webRTCBroadcasting.stopBroadcasting();
      
      this.logger.info("Stream stopped successfully");
      
      return {
        stream: {
          status: "stopped"
        }
      };
    } catch (error) {
      this.logger.error(`Stop stream failed: ${error.message}`);
      throw error;
    }
  }

  setupStreamControl(req, controlMinutes) {
    const controlId = uuidv4().replace(/-/g, '');
    let nextStart = this.nextControlStart;
    
    if (nextStart === 0 || nextStart < new Date()) {
      nextStart = new Date();
      this.nextControlStart = new Date(Date.now() + controlMinutes * 60000);
      const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes expiry
      
      this.streamControlIds[controlId] = {
        start: nextStart,
        expiresAt: expiresAt
      };
      
      this.logger.info(`Setup stream control: ${controlId}`);
      return controlId;
    }
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { StreamRouter };