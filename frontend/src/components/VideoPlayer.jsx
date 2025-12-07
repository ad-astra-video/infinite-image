import React, { useState, useEffect, useRef } from 'react'
import {
  Coffee,
  Video,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import { useWallet } from './WalletConnect'
import { API_BASE } from '../utils/apiConfig'

function VideoPlayer({
  onOpenSettings,
  streamSettings
}) {
  const wallet = useWallet()

  function buildXPaymentHeader(authorization, signature, x402Version, x402scheme, network) {
    const payload = JSON.stringify({
      "x402Version": x402Version,
      "scheme": x402scheme,
      "network": network,
      "payload": {
        "signature": signature,
        "authorization": authorization
      }
    })

    return btoa(unescape(encodeURIComponent(payload)))
  }

  const [streamUrl, setStreamUrl] = useState(null)
  const [streamStatus, setStreamStatus] = useState('loading')
  const [tipJarOpen, setTipJarOpen] = useState(false)
  const [tipMessage, setTipMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const videoRef = useRef(null)

  // Fetch stream URL on component mount
  useEffect(() => {
    fetchStreamUrl()
  }, [])

  // Listen for tip jar open requests from chat interface
  useEffect(() => {
    const handleOpenTipJar = () => {
      setTipJarOpen(true)
    }

    window.addEventListener('openTipJar', handleOpenTipJar)
    return () => {
      window.removeEventListener('openTipJar', handleOpenTipJar)
    }
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
    const tipBody = { "msg": message, "userAddress": wallet.address || wallet.loginAddress }
    try {
      const response = await fetch(`${API_BASE}/api/tip/${amount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tipBody)
      })

      // If the server requires a payment challenge, it may return 402 with typed-data
      if (response.status === 402) {
        // Attempt to parse typed-data challenge from the response body
        const paymentRequirements = await response.json().catch(() => null)
        if (!paymentRequirements) throw new Error('Payment required but no challenge provided')

        // Sign and build X-PAYMENT header, then retry
        try {
          const { authorization, signature, x402Version, x402scheme, network } = await wallet.signX402(paymentRequirements)
          const paymentHeader = buildXPaymentHeader(authorization, signature, x402Version, x402scheme, network)

          const retry = await fetch(`${API_BASE}/api/tip/${amount}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PAYMENT': paymentHeader,
            },
            body: JSON.stringify(tipBody),
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
      
      // Dispatch tip success event for chat interface
      window.dispatchEvent(new CustomEvent('tipSuccess', { detail: { amount } }))
      
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


  return (
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
                <div className="tip-jar-text">Send a tip</div>
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
                  <div className="tip-buttons-row">
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
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(25, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      ${(25 * 0.01).toFixed(2)}
                    </button>
                  </div>
                  <div className="tip-buttons-row">
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(100, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      $1.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(500, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      $5.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(1000, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      $10.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(2500, tipMessage)}
                      disabled={loading || !wallet.connected}
                      title={!wallet.connected ? 'Connect wallet first' : ''}
                    >
                      $25.00
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default VideoPlayer
