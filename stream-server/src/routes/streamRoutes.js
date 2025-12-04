const express = require('express');
const { paymentMiddleware } = require('x402-express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

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
        
    this.setupRoutes();
  }

  setupRoutes() {
    // Stream URL endpoint
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

    // Start stream endpoint
    this.router.post('/start', async (req, res) => {
      try {
        const result = await this.startStream(req);
        res.json(result);
      } catch (error) {
        this.logger.error(`Start stream endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Update stream endpoint
    this.router.post('/update', async (req, res) => {
      try {
        const result = await this.updateStream(req.body);
        res.json(result);
      } catch (error) {
        this.logger.error(`Update stream endpoint failed: ${error.message}`);
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
          urls: this.streamUrls
        });
      } catch (error) {
        this.logger.error(`Stream status endpoint failed: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async startStream(req = null) {
    try {
      const startReq = JSON.parse(fs.readFileSync("start_request.json", 'utf8'));
      const livepeerHdr = startReq.header;
      livepeerHdr.request = JSON.stringify(startReq.request);
      livepeerHdr.parameters = JSON.stringify(startReq.parameters);

      const startResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/start`,
        startReq.stream_request,
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
      this.logger.info("Stream started");
      
      return {
        stream: {
          status: "running"
        }
      };
    } catch (error) {
      this.logger.error(`Start stream failed: ${error.message}`);
      throw error;
    }
  }

  async updateStream(req) {
    if (!req.controlId) {
      throw new Error("Missing control_id for stream update");
    }

    const controlIdData = this.streamControlIds[req.controlId];
    if (!controlIdData) {
      throw new Error("Invalid control_id for stream update");
    }

    const now = new Date();
    if (now < controlIdData.start || now > controlIdData.expiresAt) {
      throw new Error(`control_id has expired or not yet active, start_utc: ${controlIdData.start.toISOString()}, expires_at_utc: ${controlIdData.expiresAt.toISOString()}`);
    }

    try {
      const updateResp = await axios.post(
        `${process.env.GATEWAY_URL || "https://gateway.muxion.video"}/ai/stream/${this.streamId}/update`,
        { params: req },
        { headers: { "Authorization": `Bearer ${process.env.GATEWAY_API_KEY}` } }
      );

      if (updateResp.status !== 200) {
        this.logger.error(`Failed to update stream: ${updateResp.status} ${updateResp.data}`);
        throw new Error("Failed to update stream");
      }

      this.logger.info(`Stream updated for control_id: ${req.controlId}`);
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