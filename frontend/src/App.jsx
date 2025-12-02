import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import SettingsModal from './components/SettingsModal'
import WalletConnect from './components/WalletConnect'
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

const API_BASE = ''

function App() {
  const [streamUrl, setStreamUrl] = useState(null)
  const [streamStatus, setStreamStatus] = useState('loading')
  const [tipJarOpen, setTipJarOpen] = useState(false)
  const [directorOpen, setDirectorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tipMessage, setTipMessage] = useState('')
  const [messages, setMessages] = useState([])
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
    fetchMessages()
  }, [])

  const fetchStreamUrl = async () => {
    try {
      const response = await fetch(`${API_BASE}/stream/url`)
      const data = await response.json()
      
      if (data.stream.status === 'running' && data.stream.whep_url) {
        setStreamUrl(data.stream.whep_url)
        setStreamStatus('running')
      } else {
        setStreamStatus('not_running')
      }
    } catch (error) {
      console.error('Failed to fetch stream URL:', error)
      setStreamStatus('error')
    }
  }

  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/super/chat`)
      const data = await response.json()
      if (data.msg) {
        setMessages(prev => [...prev, data.msg])
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleTip = async (amount) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/tip/${amount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg: tipMessage || `Tip of $${(amount * 0.01).toFixed(2)}`
        })
      })
      
      if (response.ok) {
        setTipMessage('')
        setTipJarOpen(false)
        // Show success feedback
        setMessages(prev => [...prev, { msg: `Tip sent: $${(amount * 0.01).toFixed(2)}`, level: amount }])
      }
    } catch (error) {
      console.error('Failed to send tip:', error)
    }
    setLoading(false)
  }

  const handleDirector = async (amount) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/stream/director/${amount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamSettings)
      })
      
      if (response.ok) {
        const data = await response.json()
        setDirectorOpen(false)
        setDirectorRequestSuccessful(true)
        setMessages(prev => [...prev, {
          msg: `Director control activated: $${amount}.00`,
          level: amount
        }])
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
              <button onClick={fetchStreamUrl} className="btn btn-primary">
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
                      onClick={() => handleTip(1)}
                      disabled={loading}
                    >
                      ${(1 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(5)}
                      disabled={loading}
                    >
                      ${(5 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(10)}
                      disabled={loading}
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
                      disabled={loading}
                    >
                      ${(1).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDirector(5)}
                      disabled={loading}
                    >
                      ${(5).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleDirector(10)}
                      disabled={loading}
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
        <div className="super-chat-ticker glass">
          <div className="ticker-content">
            {messages.length > 0 ? (
              <div className="ticker-messages">
                {messages.map((msg, index) => (
                  <span key={index} className="ticker-message">
                    <span className="ticker-level">Level {msg.level}</span>
                    <span className="ticker-text">{msg.msg}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="ticker-placeholder">
                <span className="ticker-text">No messages yet...</span>
              </div>
            )}
          </div>
        </div>

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
