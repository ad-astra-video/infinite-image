const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
require('dotenv').config();

// Import XMTP modules
const { XMTPMessages } = require('./xmtp-handler');
const { MessageRouter } = require('./routes/messageRoutes');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'xmtp-messages-microservice',
    version: '1.0.0'
  });
});

// Initialize XMTP handler
const xmtpHandler = new XMTPMessages({
  logger,
  environment: process.env.XMTP_ENVIRONMENT || 'production',
  appName: 'x402-gateway',
  appVersion: '1.0.0'
});

// Initialize message router
const messageRouter = new MessageRouter(xmtpHandler, logger);

// Mount routes
app.use('/api/messages', messageRouter.getRouter());

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  xmtpHandler.close().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  xmtpHandler.close().then(() => {
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`XMTP Messages Microservice started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`XMTP Environment: ${process.env.XMTP_ENVIRONMENT || 'production'}`);
});

module.exports = app;