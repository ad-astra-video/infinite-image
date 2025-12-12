# X402 Streaming Application

A modern streaming application built with React and Vite that integrates with the X402 payment system and Ethereum wallet for AI-powered image generation streaming.

## Features

### 🎥 Square Video Player
- Fixed square video player that stays on screen with no scrolling
- Connects to whep_url when page loads
- Responsive design that adapts to different screen sizes
- Loading states and error handling

### 🎨 Tip Jar
- Located in top-left corner with coffee icon
- Three tip options: $0.01, $0.05, $0.10
- Optional message input for tips
- Connects to `/api/tip/*` endpoints
- Real-time feedback and chat integration

### 🎬 Director Controls
- Located in top-left corner with video icon
- Three control options: $1.00, $5.00, $10.00
- Opens stream settings modal after successful request
- Connects to `/api/stream/director/*` endpoints

### ⚙️ Stream Settings
- Prompt text area for AI generation
- Steps slider (1-100, default: 28)
- Guidance scale slider (0.1-20, default: 4.0)
- Reference image upload (up to 10 images)
- Real-time preview of uploaded images

### 💬 Super Chat Ticker
- Bottom ticker-style overlay like scrolling stock prices
- Continuous horizontal scrolling animation
- Real-time tip messages and stream status
- Glassmorphism design with accent colors
- Hover to pause animation
- Responsive sizing for all devices

### 🎨 Design
- Dark theme with modern glassmorphism design
- Minimalist icons using Lucide React
- Smooth animations and transitions
- Mobile-first responsive design
- Expert UX principles

## Technology Stack

- **Frontend**: React 18, Vite 4
- **UI Framework**: Lucide React icons
- **Styling**: CSS with CSS variables and glassmorphism
- **Backend Integration**: X402 payment middleware
- **Ethereum**: Web3 integration for wallet system

## Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

## Development

To run the application in development mode:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Backend Integration

The application integrates with the existing Python server (`server.py`) which provides:

- `/stream/url` - Get stream playback URL
- `/api/tip/*` - Handle tip payments
- `/api/stream/director/*` - Handle director control payments
- `/api/super/chat` - Get chat messages
- X402 payment middleware for Ethereum transactions

## Usage

1. **Start Stream**: Use Director controls ($1.00, $5.00, $10.00) to start or control the AI image generation stream
2. **Send Tips**: Use Tip Jar ($0.01, $0.05, $0.10) to send tips with optional messages
3. **Configure Settings**: Click Settings to adjust prompt, steps, guidance scale, and upload reference images
4. **View Chat**: Watch real-time chat messages and stream status updates

## API Endpoints

### Stream Management
- `GET /stream/url` - Get current stream URL and status
- `POST /api/stream/director/{amount}` - Start/control stream with director mode

### Tips
- `POST /api/tip/{amount}` - Send tip with optional message
- `GET /api/super/chat` - Get latest chat messages

### Payments
- X402 payment middleware handles Ethereum transactions
- Integrates with existing wallet system in `data/wallet/eth_wallet.json`

## File Structure

```
frontend/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css        # Application-specific styles
│   ├── index.css     # Global styles and utilities
│   └── main.jsx      # React entry point
├── index.html          # HTML template
├── vite.config.js       # Vite configuration
└── package.json        # Dependencies and scripts
```

## Responsive Design

- **Desktop**: Full-featured interface with all controls visible
- **Tablet**: Optimized layout with collapsible panels
- **Mobile**: Touch-friendly interface with stacked controls

## Security

- X402 payment middleware protects against unauthorized access
- Ethereum wallet integration for secure transactions
- Input validation and sanitization
- HTTPS recommended for production deployment

## Performance

- Optimized bundle size: 152.27 kB (48.99 kB gzipped)
- Fast build time: ~2 seconds
- Efficient React rendering with hooks
- Lazy loading and code splitting ready

## Browser Support

- Modern browsers with ES6+ support
- WebRTC support for video streaming
- CSS Grid and Flexbox support
- Backdrop-filter for glassmorphism effects

## Deployment

The application is built into the `dist/` directory and is automatically served by the Python server at the root path (`/`).

To deploy:
1. Build the frontend: `npm run build`
2. Ensure the Python server is running
3. Access the application at `http://localhost:4021`

## Troubleshooting

- **Stream not loading**: Check if stream is running via `/stream/url` endpoint
- **Payment issues**: Verify X402 middleware configuration and wallet setup
- **UI issues**: Check browser console for JavaScript errors
- **Performance**: Monitor network requests and bundle size

## License

This project is part of the X402 streaming ecosystem and follows the same licensing terms.