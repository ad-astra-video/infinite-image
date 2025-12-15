import React, { useState, useEffect, useRef } from 'react'
import {
  Coffee,
  Video,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Settings2
} from 'lucide-react'
import { useWallet } from './WalletConnect'
import { API_BASE } from '../utils/apiConfig'
import AdminPanel from './AdminPanel'
import { Toast, ToastContainer } from './Toast'

// Check if user is admin before showing admin button
function useAdminCheck(address, isConnected, enhancedAuth) {
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const checkAdminStatus = async () => {      
      // Only proceed if wallet is connected and authentication is verified
      if (!isConnected || !address || !enhancedAuth?.authenticated) {
        setIsAdmin(false);
        return;
      }
      
      try {
        const response = await fetch(`${API_BASE}/api/stream/admin/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        
        const data = await response.json();
        
        setIsAdmin(data.isAdmin);
      } catch (error) {
        setIsAdmin(false);
      }
    };
    
    checkAdminStatus();
  }, [address, isConnected, enhancedAuth?.authenticated]);
  
  return isAdmin;
}

function VideoPlayer({
  onOpenSettings,
  streamSettings,
  streamData, // Enhanced with iframe_html support
  onStreamUpdate
}) {
  const wallet = useWallet()
  const isAdmin = useAdminCheck(wallet.address, wallet.isConnected, wallet.enhancedAuth)
 
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
  const [playerType, setPlayerType] = useState('webrtc')
  const [tipJarOpen, setTipJarOpen] = useState(false)
  const [tipMessage, setTipMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [tipError, setTipError] = useState('')
  const [showTipToast, setShowTipToast] = useState(false)

  // YouTube-style video player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [controlsTimeout, setControlsTimeout] = useState(null)

  const videoRef = useRef(null)

  // Determine player type based on stream data
  useEffect(() => {
    if (streamData?.iframe_html && streamData.iframe_html.trim()) {
      setPlayerType('iframe');
    } else {
      setPlayerType('webrtc');
      // Auto-setup WHEP connection when no iframe is available
      if (streamData?.stream_id && !streamData?.whep_url && streamStatus === 'not_running') {
        setupWhepConnection();
      }
    }
  }, [streamData]);

  // Fetch stream URL on component mount
  useEffect(() => {
    fetchStreamUrl()
  }, [])

  // Refresh stream data when page becomes visible (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchStreamUrl();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Periodic refresh of stream data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStreamUrl();
    }, 30000); // 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, []);

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

  // Add video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('play', () => setIsPlaying(true))
      video.addEventListener('pause', () => setIsPlaying(false))
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('play', () => setIsPlaying(true))
        video.removeEventListener('pause', () => setIsPlaying(false))
      }
    }
  }, [streamUrl])

  // Add fullscreen event listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const fetchStreamUrl = async () => {
    try {      
      const response = await fetch(`${API_BASE}/api/stream/url`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Update streamData with fresh data from server
        if (onStreamUpdate && data.stream) {
          onStreamUpdate(data.stream);
        }
        
        // Set stream URL and status based on fresh data
        if (data.stream?.whep_url) {
          setStreamUrl(data.stream.whep_url);
          setStreamStatus('running');
        } else {
          setStreamStatus('not_running');
        }
      } else {
        setStreamStatus('error');
      }
    } catch (error) {
      console.error('Failed to fetch stream URL:', error)
      setStreamStatus('error')
    }
  }

  const setupWhepConnection = async () => {
    try {
      
      const response = await fetch(`${API_BASE}/api/stream/setup-whep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          streamId: streamData?.stream_id
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.whep_url) {
          setStreamUrl(data.whep_url);
          setStreamStatus('running');
        }
      } else {
        setStreamStatus('error');
      }
    } catch (error) {
      setStreamStatus('error');
    }
  }

  // YouTube-style video control functions
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleProgressClick = (e) => {
    if (videoRef.current && duration > 0) {
      const rect = e.target.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const progressWidth = rect.width
      const newTime = (clickX / progressWidth) * duration
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      if (newVolume === 0) {
        setIsMuted(true)
      } else if (isMuted) {
        setIsMuted(false)
      }
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(() => {
        // Fallback for browsers that don't support fullscreen
      })
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      }).catch(() => {
        // Fallback
      })
    }
  }

  const skipTime = (seconds) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeout) {
      clearTimeout(controlsTimeout)
    }
    const timeout = setTimeout(() => {
      setShowControls(false)
    }, 3000)
    setControlsTimeout(timeout)
  }

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleTip = async (amount, message = '') => {
    console.log('handleTip called with amount:', amount, 'message:', message, 'walletConnected:', wallet.connected)
    setLoading(true)
    setTipError('')
    
    if (!wallet.connected) {
      console.error('handleTip: Wallet not connected according to context')
      setTipError('Wallet not connected')
      setLoading(false)
      setShowTipToast(true)
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
      setLoading(false)
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
      setTipError(error.message || 'Tip failed. Please try again.')
      setLoading(false)
      setShowTipToast(true)
      // Dispatch tip failure event for other components
      window.dispatchEvent(new CustomEvent('tipFailure', { detail: { amount, error: error.message } }))
    } finally {
      console.log("Tip process completed")
    }
  }


  return (
    <div className="video-container">
      <div className="video-wrapper">
        {streamStatus === 'loading' && (
          <div className="youtube-loading-state">
            <div className="youtube-loading-spinner">
              <Loader2 className="animate-spin" size={48} />
            </div>
            <p className="youtube-loading-text">Connecting to stream...</p>
          </div>
        )}
        
        {streamStatus === 'not_running' && (
          <div className="youtube-no-stream-state">
            <Video size={64} className="youtube-no-stream-icon" />
            <p className="youtube-no-stream-title">Stream not active</p>
            <p className="youtube-no-stream-subtitle">Director controls will start the stream</p>
          </div>
        )}
        
        {streamStatus === 'error' && (
          <div className="youtube-error-state">
            <div className="youtube-error-content">
              <p className="youtube-error-title">Connection error</p>
              <p className="youtube-error-subtitle">
                {playerType === 'webrtc' ? 'WHEP connection failed' : 'Stream connection failed'}
              </p>
              <button
                onClick={() => {
                  fetchStreamUrl();
                }}
                className="youtube-retry-btn"
              >
                Refresh Stream Data
              </button>
            </div>
          </div>
        )}
        
        {/* Priority order: playback_url > iframe_html > webrtc */}
        {streamData && streamData.playback_url && (
          <div
            className="youtube-player-container"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
          >
            <video
              ref={videoRef}
              className="stream-video"
              autoPlay
              muted={isMuted}
              playsInline
              onClick={togglePlayPause}
            >
              <source src={streamData.playback_url} type="application/x-mpegURL" />
              <source src={streamData.playback_url} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            
            {/* YouTube-style controls overlay */}
            <div className={`youtube-controls-overlay ${showControls ? 'visible' : 'hidden'}`}>
              {/* Play/Pause button */}
              <div className="youtube-control-center">
                <button
                  className="youtube-play-pause-btn"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? <Pause size={48} /> : <Play size={48} />}
                </button>
              </div>
              
              {/* Bottom controls */}
              <div className="youtube-bottom-controls">
                {/* Progress bar */}
                <div className="youtube-progress-container">
                  <div
                    className="youtube-progress-bar"
                    onClick={handleProgressClick}
                  >
                    <div
                      className="youtube-progress-fill"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                
                {/* Control buttons and time */}
                <div className="youtube-controls-row">
                  {/* Left side controls */}
                  <div className="youtube-controls-left">
                    <button className="youtube-control-btn" onClick={() => skipTime(-10)}>
                      <SkipBack size={20} />
                    </button>
                    <button className="youtube-control-btn" onClick={togglePlayPause}>
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button className="youtube-control-btn" onClick={() => skipTime(10)}>
                      <SkipForward size={20} />
                    </button>
                    
                    {/* Volume control */}
                    <div className="youtube-volume-container">
                      <button className="youtube-control-btn" onClick={toggleMute}>
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="youtube-volume-slider"
                      />
                    </div>
                    
                    {/* Time display */}
                    <div className="youtube-time-display">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>
                  
                  {/* Right side controls */}
                  <div className="youtube-controls-right">
                    <button className="youtube-control-btn" onClick={toggleFullscreen}>
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {streamData && !streamData.playback_url && playerType === 'iframe' && streamData.iframe_html && (
          <div className="iframe-player-container">
            <div
              dangerouslySetInnerHTML={{ __html: streamData.iframe_html }}
              className="iframe-player"
            />
          </div>
        )}
        
        {streamData && !streamData.playback_url && playerType === 'webrtc' && streamUrl && (
          <div
            className="youtube-player-container"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
          >
            <video
              ref={videoRef}
              className="stream-video"
              autoPlay
              muted={isMuted}
              playsInline
              onClick={togglePlayPause}
            >
              <source src={streamUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            
            {/* YouTube-style controls overlay */}
            <div className={`youtube-controls-overlay ${showControls ? 'visible' : 'hidden'}`}>
              {/* Play/Pause button */}
              <div className="youtube-control-center">
                <button
                  className="youtube-play-pause-btn"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? <Pause size={48} /> : <Play size={48} />}
                </button>
              </div>
              
              {/* Bottom controls */}
              <div className="youtube-bottom-controls">
                {/* Progress bar */}
                <div className="youtube-progress-container">
                  <div
                    className="youtube-progress-bar"
                    onClick={handleProgressClick}
                  >
                    <div
                      className="youtube-progress-fill"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                
                {/* Control buttons and time */}
                <div className="youtube-controls-row">
                  {/* Left side controls */}
                  <div className="youtube-controls-left">
                    <button className="youtube-control-btn" onClick={() => skipTime(-10)}>
                      <SkipBack size={20} />
                    </button>
                    <button className="youtube-control-btn" onClick={togglePlayPause}>
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button className="youtube-control-btn" onClick={() => skipTime(10)}>
                      <SkipForward size={20} />
                    </button>
                    
                    {/* Volume control */}
                    <div className="youtube-volume-container">
                      <button className="youtube-control-btn" onClick={toggleMute}>
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="youtube-volume-slider"
                      />
                    </div>
                    
                    {/* Time display */}
                    <div className="youtube-time-display">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>
                  
                  {/* Right side controls */}
                  <div className="youtube-controls-right">
                    <button className="youtube-control-btn" onClick={toggleFullscreen}>
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                
                {/* USDC Balance Warning */}
                {wallet.usdcBalance === '0.00' && (
                  <div className="tip-warning" style={{
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}>
                    ⚠️ Your USDC balance on {wallet.network} is 0.00. Please get some USDC on {wallet.network} to send tips.
                  </div>
                )}
                
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
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      ${(1 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(5, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      ${(5 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(10, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      ${(10 * 0.01).toFixed(2)}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(25, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      ${(25 * 0.01).toFixed(2)}
                    </button>
                  </div>
                  <div className="tip-buttons-row">
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(100, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      $1.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(500, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      $5.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(1000, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      $10.00
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleTip(2500, tipMessage)}
                      disabled={loading || !wallet.connected || wallet.usdcBalance === '0.00'}
                      title={!wallet.connected ? 'Connect wallet first' : wallet.usdcBalance === '0.00' ? 'Insufficient USDC balance' : ''}
                    >
                      $25.00
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Admin Panel Button - only show for verified admin users */}
        {isAdmin && (
          <div className="control-group">
            <button
              className="control-btn glass"
              onClick={() => {
                // Trigger admin panel modal through custom event
                window.dispatchEvent(new CustomEvent('toggleAdminPanel'));
              }}
              disabled={loading}
            >
              <Settings2 size={20} />
              <span>Admin Panel</span>
              <ChevronDown size={16} />
            </button>
          </div>
        )}

        {/* Toast notifications for tip failures */}
        <ToastContainer>
          <Toast
            message={tipError}
            type="warning"
            show={showTipToast}
            onClose={() => setShowTipToast(false)}
            duration={8000}
          />
        </ToastContainer>
      </div>
    </div>
  )
}

export default VideoPlayer
