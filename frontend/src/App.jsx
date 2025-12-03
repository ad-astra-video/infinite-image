import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import SettingsModal from './components/SettingsModal'
import WalletConnect from './components/WalletConnect'
import SuperChat from './components/SuperChat'
import {
  Coffee,
  Video,
  Settings,
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2
} from 'lucide-react'
import { useWallet } from './components/WalletConnect'

const API_BASE = ''

function App() {
  // Use centralized wallet hook - single source of truth for all wallet data
  const wallet = useWallet()

  function buildXPaymentHeader(authorization, signature, x402version, x402scheme, network) {
    const payload = JSON.stringify({
      "x402_version": x402version,
      "scheme": x402scheme,
      "network": network,
      "payload": {
        "signature": signature,
        "authorization": authorization
      }
    }
  )

    return btoa(unescape(encodeURIComponent(payload)))
  }


  const [streamUrl, setStreamUrl] = useState(null)
  const [streamStatus, setStreamStatus] = useState('loading')
  const [tipJarOpen, setTipJarOpen] = useState(false)
  const [directorOpen, setDirectorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tipMessage, setTipMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [directorRequestSuccessful, setDirectorRequestSuccessful] = useState(false)
  const [streamSettings, setStreamSettings] = useState({
    prompt: 'A serene landscape with mountains and a river at sunset, digital art',
    steps: 28,
    guidance_scale: 4.0,
    reference_images: []
  })

  const videoRef = useRef(null)

  // Fetch stream URL on component mount
  useEffect(() => {
    fetchStreamUrl()
  }, [])

  const fetchStreamUrl = async () => {
    try {
      setStreamStatus('not_running')
    } catch (error) {
      console.error('Failed to fetch stream URL:', error)
      setStreamStatus('error')
    }
  }

  const handleTip = async (amount, message = '') => {
    console.log('handleTip called with amount:', amount, 'message:', message, 'walletConnected:', wallet.connected)
    setLoading(true)
    
    if (!wallet.connected) {
      console.error('handleTip: Wallet not connected according to context')
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch(`http://localhost:8000/api/tip/${amount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: { msg: message }
      })

      // If the server requires a payment challenge, it may return 402 with typed-data
      if (response.status === 402) {
        // Attempt to parse typed-data challenge from the response body
        const paymentRequirements = await response.json().catch(() => null)
        if (!paymentRequirements) throw new Error('Payment required but no challenge provided')

        // Sign and build X-PAYMENT header, then retry
        try {
          const { authorization, signature, x402version, x402scheme, network } = await wallet.signX402(paymentRequirements)
          const paymentHeader = buildXPaymentHeader(authorization, signature, x402version, x402scheme, network)

          const retry = await fetch(`${API_BASE}/api/tip/${amount}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PAYMENT': paymentHeader,
            },
            body: JSON.stringify({ msg: message }),
          })

          if (!retry.ok) {
            const errText = await retry.text().catch(() => retry.statusText)
            throw new Error(errText || `HTTP ${retry.status}`)
          }
        } catch (signErr) {
          throw signErr
        }
      } else {
        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText)
          throw new Error(errText || `HTTP ${response.status}`)
        }
      }

      setTipMessage('')
      setTipJarOpen(false)
      // Refresh USDC balance after a successful tip (wait briefly for network propagation)
      try {
        // small delay to allow the payment/facilitator and RPC to reflect the new balance
        await new Promise(resolve => setTimeout(resolve, 3000))
        if (wallet?.refetchUsdc) await wallet.refetchUsdc()
      } catch (e) {
        console.warn('Failed to refetch USDC balance after tip', e)
      }
    } catch (error) {
      console.error('Failed to send tip:', error)
    }
    setLoading(false)
  }

  const handleDirector = async (amount) => {
    console.log('handleDirector called with amount:', amount, 'walletConnected:', wallet.connected)
    setLoading(true)
    
    if (!wallet.connected) {
      console.error('handleDirector: Wallet not connected according to context')
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/stream/director/${amount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
      })

      if (response.status === 402) {
        const paymentRequirements = await response.json().catch(() => null)
        if (!paymentRequirements) throw new Error('Payment required but no challenge provided')

        try {
          const { authorization, signature, x402version, x402scheme, network } = await wallet.signX402(paymentRequirements)
          const paymentHeader = buildXPaymentHeader(authorization, signature, x402version, x402scheme, network)

          const retry = await fetch(`${API_BASE}/api/stream/director/${amount}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PAYMENT': paymentHeader,
            },
            body: JSON.stringify({ settings: streamSettings }),
          })

          if (!retry.ok) {
            const errText = await retry.text().catch(() => retry.statusText)
            throw new Error(errText || `HTTP ${retry.status}`)
          }
        } catch (signErr) {
          throw signErr
        }
      } else {
        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText)
          throw new Error(errText || `HTTP ${response.status}`)
        }
      }

      setDirectorOpen(false)
      setDirectorRequestSuccessful(true)
      // Refresh USDC balance after director request succeeds (allow brief propagation)
      try {
        await new Promise(resolve => setTimeout(resolve, 3000))
        if (wallet?.refetchUsdc) await wallet.refetchUsdc()
      } catch (e) {
        console.warn('Failed to refetch USDC balance after director request', e)
      }
      
    } catch (error) {
      console.error('Failed to send director request:', error)
    }
    setLoading(false)
  }

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    const imagePromises = files.slice(0, 10).map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          resolve(`data:${file.type};base64,${btoa(event.target.result)}`)
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(imagePromises).then(images => {
      setStreamSettings(prev => ({
        ...prev,
        reference_images: images
      }))
    })
  }

  const handleSettingsChange = (updater) => {
    setStreamSettings(updater)
  }

  const handleApplySettings = () => {
    setSettingsOpen(false)
    setDirectorOpen(true)
  }

  return (
    <div className="app">
      {/* Top Wallet Toolbar */}
      <div className="top-wallet-toolbar">
        <WalletConnect />
      </div>

      {/* Video container with controls overlaid */}
      <div className="video-container">
        <div className="video-wrapper">
          {streamStatus === 'loading' && (
            <div className="loading-state glass">
              <Loader2 className="animate-spin" size={32} />
              <p>Connecting to stream...</p>
            </div>
          )}
          
          {streamStatus === 'not_running' && (
            <div className="no-stream-state glass">
              <Video size={48} />
              <p>Stream not active</p>
              <p className="subtitle">Director controls will start the stream</p>
            </div>
          )}
          
          {streamStatus === 'error' && (
            <div className="error-state glass">
              <p>Connection error</p>
              <button onClick={() => fetchStreamUrl()} className="btn btn-primary">
                Retry
              </button>
            </div>
          )}
          
          {streamUrl && (
            <video
              ref={videoRef}
              className="stream-video"
              autoPlay
              muted
              controls
              playsInline
            >
              <source src={streamUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          )}
        </div>

        {/* Controls overlay on video */}
        <div className="video-controls-overlay">
          {/* Tip Jar */}
          <div className="control-group">
            <button
              className="control-btn glass"
              onClick={() => {
                if (directorOpen) {
                  setDirectorOpen(false)
                }
                setTipJarOpen(!tipJarOpen)
              }}
              disabled={loading}
            >
              <Coffee size={20} />
              {tipJarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {tipJarOpen && (
              <div className="dropdown glass">
                <div className="dropdown-content">
                  <div className="tip-input-group">
                    <input
                      type="text"
                      placeholder="Message (optional)"
                      value={tipMessage}
                      onChange={(e) => setTipMessage(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div className="tip-buttons">
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(1, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(1 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(5, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(5 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(10, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(10 * 0.01).toFixed(2)}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Director Controls */}
          <div className="control-group">
            <button
              className="control-btn glass"
              onClick={() => {
                if (tipJarOpen) {
                  setTipJarOpen(false)
                }
                setDirectorOpen(!directorOpen)
              }}
              disabled={loading}
            >
              <Video size={20} />
              {directorOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {directorOpen && (
              <div className="dropdown glass">
                <div className="dropdown-content">
                  <div className="tip-buttons">
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDirector(1)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(1).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDirector(5)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(5).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDirector(10)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(10).toFixed(2)}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings Button - only visible after successful director request */}
          {directorRequestSuccessful && (
            <div className="control-group">
              <button
                className="control-btn glass"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={20} />
              </button>
            </div>
          )}
        </div>
        {/* Super Chat Ticker - moved inside video-container to match width */}
        <SuperChat />

      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={streamSettings}
        onSettingsChange={handleSettingsChange}
        onImageUpload={handleImageUpload}
        onApply={handleApplySettings}
      />
    </div>
  )
}

export default App
