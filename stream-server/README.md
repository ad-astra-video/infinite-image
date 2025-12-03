# Stream Server

A Node.js Express server that replicates the functionality of the original Python FastAPI server for handling streaming, payments, and chat features.

## Features

- **Stream Management**: Start and update video streams using Muxion API
- **Payment Integration**: x402 payment middleware for paid endpoints
- **Web3 Integration**: Automatic USDC sweeping from deposit address
- **Chat System**: Super chat functionality with expiration
- **Static File Serving**: Serves frontend assets and HTML
- **Security**: Rate limiting, CORS, and security headers

## Endpoints

### Stream Management
- `POST /api/stream/director/1` - Start/update stream with $1 payment
- `POST /api/stream/director/5` - Start/update stream with $5 payment
- `POST /api/stream/director/10` - Start/update stream with $10 payment
- `POST /api/stream/director/update` - Update existing stream
- `GET /stream/url` - Get current stream URL information

### Payment Endpoints
- `POST /api/tip/1` - Send $0.01 tip
- `POST /api/tip/5` - Send $0.05 tip
- `POST /api/tip/10` - Send $0.10 tip
- `POST /api/stream/payment/sent` - Confirm payment received

### Chat System
- `GET /api/super/chat` - Get active super chats

### Utility
- `GET /health` - Health check endpoint
- `GET /` - Serve frontend application
- `GET /assets/*` - Serve static assets

## Setup

1. **Install Dependencies**
   ```bash
   cd stream-server
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configuration:
   - `MUXION_GATEWAY_API_KEY`: Your Muxion API key
   - `FACILITATOR_URL`: x402 facilitator URL
   - `BASE_RPC_URL`: Base network RPC URL
   - `SWEEP_ADDRESS`: Address to sweep USDC to

3. **Create Wallet Directory**
   ```bash
   mkdir -p /wallet
   ```

4. **Start Server**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

| Variable | Description | Required |
|-----------|-------------|-----------|
| `MUXION_GATEWAY_API_KEY` | API key for Muxion streaming service | Yes |
| `FACILITATOR_URL` | x402 payment facilitator URL | Yes |
| `BASE_RPC_URL` | Base network RPC endpoint | Yes |
| `SWEEP_ADDRESS` | Address to sweep USDC funds to | Yes |

### Wallet Management

The server automatically creates or loads an Ethereum wallet for deposit handling:
- Wallet file location: `/wallet/eth_wallet.json`
- Contains: `address` and `private_key`
- Used for receiving payments and sweeping USDC

### USDC Sweeping

The server includes automatic USDC sweeping functionality:
- Runs every minute
- Transfers USDC from deposit address to sweep address
- Only transfers if balance exceeds 1 USDC threshold
- Uses Base network USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## API Usage Examples

### Starting a Stream

```bash
curl -X POST http://localhost:4021/api/stream/director/1 \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "seed": 42,
    "steps": 28,
    "guidance_scale": 4.0
  }'
```

### Sending a Tip

```bash
curl -X POST http://localhost:4021/api/tip/1 \
  -H "Content-Type: application/json" \
  -d '{"msg": "Great stream!"}'
```

### Getting Stream URL

```bash
curl http://localhost:4021/stream/url
```

## Security Features

- **Rate Limiting**: 1000 requests per 15 minutes per IP
- **CORS**: Configured for localhost:3000
- **Helmet**: Security headers
- **Input Validation**: Request body validation

## Differences from Python Version

1. **Language**: Node.js/Express vs Python/FastAPI
2. **Dependencies**: npm packages vs Python packages
3. **Payment Middleware**: Simplified simulation vs full x402 integration
4. **Web3 Library**: web3.js vs web3.py
5. **Error Handling**: Try-catch blocks vs Python exceptions

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure all required env vars are set in `.env`
   - Check BASE_RPC_URL is valid

2. **Wallet Creation Fails**
   - Ensure `/wallet` directory exists
   - Check write permissions

3. **USDC Sweep Failures**
   - Verify BASE_RPC_URL is correct
   - Check private key is valid
   - Ensure sufficient ETH for gas fees

4. **Stream Start Failures**
   - Verify MUXION_API_KEY is correct
   - Check `start_request.json` exists and is valid

### Logs

The server logs to console with INFO and ERROR levels:
- `[INFO]`: General operation logs
- `[ERROR]`: Error messages with details

## Development

### Adding New Endpoints

1. Add route handler in `index.js`
2. Add payment middleware if needed
3. Add logging for debugging
4. Add input validation

### Testing

```bash
npm test
```

### Debug Mode

```bash
DEBUG=* npm start
```

## License

This project is part of the x402-gateway repository.