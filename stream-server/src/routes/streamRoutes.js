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

  // Sanitize iframe HTML to prevent XSS attacks
  sanitizeIframeHtml(iframeHtml) {
    if (!iframeHtml || typeof iframeHtml !== 'string') {
      return '';
    }
    
    // Remove script tags and javascript: URLs
    let sanitized = iframeHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick, onload, etc.
    
    // Basic iframe tag validation - ensure it contains only safe attributes
    const iframeRegex = /<iframe[^>]*>/gi;
    const iframeMatches = sanitized.match(iframeRegex);
    
    if (iframeMatches) {
      iframeMatches.forEach(iframeTag => {
        // Only allow safe iframe attributes
        const allowedAttributes = ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title'];
        const unsafeAttributes = iframeTag.match(/\s(\w+)=/g) || [];
        
        unsafeAttributes.forEach(attr => {
          const attrName = attr.trim().split('=')[0];
          if (!allowedAttributes.includes(attrName)) {
            sanitized = sanitized.replace(attr, '');
          }
        });
      });
    }
    
    return sanitized.trim();
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
            whep_url: null,
            iframe_html: ''
          }
        });
      }

      let whepUrl = this.streamUrls.whep_url;
      if (!whepUrl && this.streamUrls.stream_id) {
        const GATEWAY_URL = process.env.GATEWAY_URL || "https://gateway.muxion.video";
        whepUrl = `${GATEWAY_URL.replace('gateway', 'stream')}/whep/${this.streamUrls.stream_id}`;
      }

      // Get saved stream settings to include iframe_html
      const savedSettings = this.streamSettings.get(this.streamId) || {};

      res.json({
        stream: {
          status: "running",
          whep_url: whepUrl,
          stream_id: this.streamUrls.stream_id,
          playback_url: savedSettings.playback_url || this.streamUrls.playback_url || '',
          iframe_html: savedSettings.iframe_html || ''
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
        // Get saved stream settings to include iframe_html
        const savedSettings = this.streamSettings.get(this.streamId) || {};
        
        res.json({
          running: this.streamRunning,
          stream_id: this.streamId,
          urls: this.streamUrls,
          broadcasting: this.webRTCBroadcasting.getStatus(),
          iframe_html: savedSettings.iframe_html || ''
        });
      } catch (error) {
        this.logger.error(`Stream status endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Check stream status from saved streamId (creator auth required)
    this.router.post('/check-status', creatorAuthMiddleware, async (req, res) => {
      try {
        const { streamId } = req.body;
        if (!streamId) {
          throw new Error("streamId is required");
        }

        this.logger.info(`Checking status for streamId: ${streamId}`);

        const statusResp = await axios.get(
          `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${streamId}/status`,
          {
            headers: {
              "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}`
            }
          }
        );

        if (statusResp.status !== 200) {
          this.logger.error(`Failed to check stream status: ${statusResp.status} ${statusResp.data}`);
          throw new Error("Failed to check stream status");
        }

        const statusData = statusResp.data;
        const isAlive = statusData.whep_url && statusData.whep_url.trim() !== '';

        this.logger.info(`Stream ${streamId} status: ${isAlive ? 'alive' : 'not alive'}`);

        // If stream is alive, synchronize backend state with the stream
        if (isAlive) {
          this.logger.info(`Synchronizing backend state for stream ${streamId}`);
          this.streamRunning = true;
          this.streamId = streamId;
          this.streamUrls = { stream_id: streamId, ...statusData };
          
          // Start WebRTC broadcasting if not already running
          if (!this.webRTCBroadcasting.isBroadcasting) {
            try {
              await this.webRTCBroadcasting.startBroadcasting(streamId);
              this.logger.info("WebRTC broadcasting started for recovered stream");
            } catch (broadcastError) {
              this.logger.warn(`Failed to start WebRTC broadcasting: ${broadcastError.message}`);
            }
          }
        }

        // Get saved stream settings if available
        const savedSettings = this.streamSettings.get(streamId) || null;

        res.json({
          stream_id: streamId,
          alive: isAlive,
          whep_url: statusData.whep_url || null,
          status: isAlive ? 'running' : 'stopped',
          settings: savedSettings,
          iframe_html: savedSettings?.iframe_html || ''
        });
      } catch (error) {
        this.logger.error(`Check stream status failed: ${error.message}`);
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

    // WHEP connection setup endpoint
    this.router.post('/setup-whep', async (req, res) => {
      try {
        const { streamId } = req.body;
        if (!streamId) {
          throw new Error("streamId is required");
        }

        this.logger.info(`Setting up WHEP connection for stream: ${streamId}`);

        // Check stream status from gateway
        const statusResp = await axios.get(
          `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${streamId}/status`,
          {
            headers: {
              "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}`
            }
          }
        );

        if (statusResp.status !== 200) {
          this.logger.error(`Failed to check stream status: ${statusResp.status} ${statusResp.data}`);
          throw new Error("Failed to check stream status");
        }

        const statusData = statusResp.data;
        const whepUrl = statusData.whep_url;

        if (!whepUrl || whepUrl.trim() === '') {
          this.logger.error(`No WHEP URL available for stream ${streamId}`);
          throw new Error("No WHEP URL available for this stream");
        }

        // Setup WHEP connection in broadcasting server
        const broadcastConfig = await this.webRTCBroadcasting.setupWhepConnection(streamId, whepUrl);

        this.logger.info(`WHEP connection setup successful for stream: ${streamId}`);

        res.json({
          success: true,
          stream_id: streamId,
          whep_url: whepUrl,
          signaling_url: broadcastConfig.signaling_url,
          message: "WHEP connection established successfully"
        });

      } catch (error) {
        this.logger.error(`WHEP setup failed: ${error.message}`);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  async startStream(req = null) {
    try {
      // Handle both file-based and direct request-based stream starts
      let streamRequest;
      let livepeerHdr;
      let streamSettings = {};
      
      if (req) {
        // Direct request-based stream start (from admin panel)
        const { height, width, rtmp_output, stream_key, playback_url, iframe_html, capability_name, ...dynamicParams } = req.body;
        
        // Required fields validation
        if (!height || !width) {
          throw new Error("Height and Width are required fields");
        }
        
        // Validate height and width limits
        const heightNum = parseInt(height);
        const widthNum = parseInt(width);
        
        if (heightNum <= 0) {
          throw new Error("Height must be a positive number");
        }
        
        if (widthNum <= 0) {
          throw new Error("Width must be a positive number");
        }
        
        if (heightNum > 1920) {
          throw new Error("Height must not exceed 1920 pixels");
        }
        
        if (widthNum > 1920) {
          throw new Error("Width must not exceed 1920 pixels");
        }
        
        // Sanitize iframe_html to prevent XSS attacks
        const sanitizedIframeHtml = this.sanitizeIframeHtml(iframe_html);
        
        // Combine RTMP URL and Stream Key
        let combinedRtmpOutput = rtmp_output;
        if (stream_key && stream_key.trim()) {
          // Remove trailing slash from RTMP URL if present
          const cleanRtmpUrl = rtmp_output.replace(/\/$/, '');
          // Append stream key with slash
          combinedRtmpOutput = `${cleanRtmpUrl}/${stream_key.trim()}`;
        }
        
        // Store complete stream settings for admin panel recovery
        streamSettings = {
          height,
          width,
          rtmp_output,
          stream_key,
          playback_url,
          iframe_html: sanitizedIframeHtml,
          dynamicParams
        };
        
        // Build stream request with all parameters
        streamRequest = {
          rtmp_output: combinedRtmpOutput,
          params: JSON.stringify({ height, width, ...dynamicParams })
        };

        const reqParams = {
          enable_video_ingress: false,
          enable_video_egress: true,
          enable_data_output: false
        }
        
        // Create livepeer header for direct requests
        livepeerHdr = {
          capability: capability_name,
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
        
        // Store settings from file for admin panel recovery
        streamSettings = {
          height: startReq.parameters?.height || '1024',
          width: startReq.parameters?.width || '1024',
          rtmp_output: startReq.stream_request?.rtmp_output || '',
          stream_key: '',
          playback_url: '',
          iframe_html: '',
          dynamicParams: startReq.parameters || {}
        };
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
      
      // Store complete stream settings for admin panel recovery
      this.streamSettings.set(this.streamId, streamSettings);
      
      // Start WebRTC broadcasting
      const broadcastConfig = await this.webRTCBroadcasting.startBroadcasting(this.streamId);
      
      this.logger.info("Stream started with WebRTC broadcasting");
      
      return {
        stream: {
          status: "running",
          ...broadcastConfig,
          stream_id: this.streamId,
          urls: this.streamUrls,
          iframe_html: streamSettings.iframe_html || '',
          playback_url: streamSettings.playback_url || ''
        }
      };
    } catch (error) {
      this.logger.error(`Start stream failed: ${error.message}`);
      throw error;
    }
  }

  async updateStream(req) {
    // Extract dynamic parameters from request body
    const { ...dynamicParams } = req;
    
    // EXCLUDE required fields - allow all other parameters to be updated
    const requiredFields = ['height', 'width', 'rtmp_output', 'stream_key', 'iframe_html'];
    const allowedParams = Object.keys(req).filter(key => !requiredFields.includes(key));
    
    if (allowedParams.length === 0) {
      throw new Error("No updatable parameters provided");
    }
    
    // Build filtered update request
    const filteredParams = allowedParams.reduce((obj, key) => {
      obj[key] = req[key];
      return obj;
    }, {});
    
    // Handle stream_key updates by combining with existing rtmp_output
    if (req.stream_key !== undefined && this.streamId) {
      const currentSettings = this.streamSettings.get(this.streamId) || {};
      const currentRtmpOutput = currentSettings.rtmp_output || '';
      
      let updatedRtmpOutput = currentRtmpOutput;
      if (req.stream_key && req.stream_key.trim()) {
        // Remove trailing slash from current RTMP URL if present
        const cleanRtmpUrl = currentRtmpOutput.replace(/\/$/, '');
        // Append stream key with slash
        updatedRtmpOutput = `${cleanRtmpUrl}/${req.stream_key.trim()}`;
      }
      
      // Update the stored settings
      const updatedSettings = {
        ...currentSettings,
        stream_key: req.stream_key,
        rtmp_output: updatedRtmpOutput
      };
      this.streamSettings.set(this.streamId, updatedSettings);
      this.logger.info(`Updated stored stream settings for stream ${this.streamId}`);
    }
    
    // Create livepeer header for direct requests
    const livepeerHdr = {
      capability: dynamicParams["capability_name"],
      request: JSON.stringify({"stream_id": this.streamId}),
      parameters: JSON.stringify({}),
      timeout_seconds: 60
    };

    try {
      const updateResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${this.streamId}/update`,
        { params: filteredParams },
        { headers: { 
            "Livepeer": Buffer.from(JSON.stringify(livepeerHdr)).toString("base64"),
            "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}` } }
      );

      if (updateResp.status !== 200) {
        this.logger.error(`Failed to update stream: ${updateResp.status} ${updateResp.data}`);
        throw new Error("Failed to update stream");
      }

      this.logger.info(`Stream updated with parameters: ${allowedParams.join(', ')}`);
      
      // Update stored stream settings if iframe_html or playback_url was provided
      if ((req.iframe_html !== undefined || req.playback_url !== undefined) && this.streamId) {
        const currentSettings = this.streamSettings.get(this.streamId) || {};
        const updatedSettings = {
          ...currentSettings
        };
        
        if (req.iframe_html !== undefined) {
          // Sanitize iframe_html to prevent XSS attacks
          const sanitizedIframeHtml = this.sanitizeIframeHtml(req.iframe_html);
          updatedSettings.iframe_html = sanitizedIframeHtml;
          this.logger.info(`Updated stored iframe_html for stream ${this.streamId}`);
        }
        
        if (req.playback_url !== undefined) {
          updatedSettings.playback_url = req.playback_url;
          this.logger.info(`Updated stored playback_url for stream ${this.streamId}`);
        }
        
        this.streamSettings.set(this.streamId, updatedSettings);
      }
      
      // Include iframe_html and playback_url in response if they were updated
      const response = {
        stream: {
          status: "updated"
        }
      };
      
      if (req.iframe_html !== undefined) {
        response.stream.iframe_html = this.sanitizeIframeHtml(req.iframe_html);
      }
      
      if (req.playback_url !== undefined) {
        response.stream.playback_url = req.playback_url;
      }
      
      return response;
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

      this.logger.info(`Stopping stream with streamId: ${this.streamId}`);

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