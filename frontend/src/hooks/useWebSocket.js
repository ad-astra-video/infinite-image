import { useState, useEffect, useRef, useCallback } from 'react'

// Connection states
const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed'
}

// Retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true
}

export function useWebSocket(url, options = {}) {
  const {
    retryConfig = DEFAULT_RETRY_CONFIG,
    onConnect = () => {},
    onDisconnect = () => {},
    onError = () => {},
    onMessage = () => {},
    autoConnect = true,
    reconnectOnError = true
  } = options

  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED)
  const [retryCount, setRetryCount] = useState(0)
  const [lastConnected, setLastConnected] = useState(null)
  const [connectionQuality, setConnectionQuality] = useState('unknown')
  
  const wsRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const isManualCloseRef = useRef(false)
  const retryConfigRef = useRef(retryConfig)
  const autoConnectRef = useRef(autoConnect)
  const reconnectOnErrorRef = useRef(reconnectOnError)

  // Update refs when options change
  useEffect(() => {
    retryConfigRef.current = retryConfig
    autoConnectRef.current = autoConnect
    reconnectOnErrorRef.current = reconnectOnError
  }, [retryConfig, autoConnect, reconnectOnError])

  // Calculate next retry delay with exponential backoff and jitter
  const calculateRetryDelay = useCallback((attempt) => {
    const { initialDelay, maxDelay, backoffMultiplier, jitter } = retryConfigRef.current
    let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1)
    delay = Math.min(delay, maxDelay)
    
    if (jitter) {
      // Add random jitter (±25%)
      const jitterRange = delay * 0.25
      delay += (Math.random() - 0.5) * 2 * jitterRange
    }
    
    return Math.max(delay, 100) // Minimum 100ms delay
  }, [])

  // Clean up WebSocket connection
  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  // Start ping interval to monitor connection health
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }
    
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
          setConnectionQuality('good')
        } catch (error) {
          console.warn('Failed to send ping:', error)
          setConnectionQuality('poor')
        }
      }
    }, 30000) // Ping every 30 seconds
  }, [])

  // Handle successful connection
  const handleConnect = useCallback(() => {
    console.log('WebSocket connected successfully')
    setConnectionState(CONNECTION_STATES.CONNECTED)
    setRetryCount(0)
    reconnectAttemptsRef.current = 0
    setLastConnected(Date.now())
    setConnectionQuality('good')
    
    // Start ping interval for connection monitoring
    startPingInterval()
    
    // Call onConnect callback
    onConnect()
  }, [])

  // Handle disconnection
  const handleDisconnect = useCallback((event) => {
    console.log('WebSocket disconnected:', event.code, event.reason)
    
    // Stop ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    
    setConnectionState(CONNECTION_STATES.DISCONNECTED)
    setConnectionQuality('unknown')
    
    // Call onDisconnect callback
    onDisconnect(event)
    
    // Attempt reconnection if not manually closed and auto reconnect is enabled
    if (!isManualCloseRef.current && autoConnectRef.current && reconnectOnErrorRef.current) {
      scheduleReconnect()
    }
  }, [])

  // Handle connection errors
  const handleError = useCallback((error) => {
    console.error('WebSocket error:', error)
    setConnectionQuality('poor')
    onError(error)
  }, [])

  // Handle incoming messages
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data)
      
      // Handle ping responses to maintain connection quality
      if (data.type === 'pong') {
        setConnectionQuality('good')
        return
      }
      
      // Call onMessage callback
      onMessage(data)
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }, [])

  // Schedule reconnection attempt
  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptsRef.current + 1
    const maxRetries = retryConfigRef.current.maxRetries
    
    if (attempt > maxRetries) {
      console.error('Max reconnection attempts reached')
      setConnectionState(CONNECTION_STATES.FAILED)
      return
    }
    
    const delay = calculateRetryDelay(attempt)
    console.log(`Scheduling reconnection attempt ${attempt}/${maxRetries} in ${delay}ms`)
    
    setConnectionState(CONNECTION_STATES.RECONNECTING)
    setRetryCount(attempt)
    
    retryTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current = attempt
      connect()
    }, delay)
  }, [calculateRetryDelay])

  // Manual connect function
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting, skipping duplicate connection attempt')
      return
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping duplicate connection attempt')
      return
    }
    
    // Clean up existing connection
    cleanup()
    
    console.log('Connecting to WebSocket:', url)
    setConnectionState(CONNECTION_STATES.CONNECTING)
    
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      
      // Set up event handlers
      ws.onopen = handleConnect
      ws.onclose = handleDisconnect
      ws.onerror = handleError
      ws.onmessage = handleMessage
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setConnectionState(CONNECTION_STATES.FAILED)
    }
  }, [url])

  // Manual disconnect function
  const disconnect = useCallback((code = 1000, reason = 'Manual disconnect') => {
    isManualCloseRef.current = true
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close(code, reason)
    }
    
    cleanup()
    setConnectionState(CONNECTION_STATES.DISCONNECTED)
  }, [])

  // Send message through WebSocket
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message))
        return true
      } catch (error) {
        console.error('Failed to send WebSocket message:', error)
        return false
      }
    } else {
      console.warn('WebSocket not connected, message not sent:', message)
      return false
    }
  }, [])

  // Get connection status information
  const getConnectionInfo = useCallback(() => {
    return {
      state: connectionState,
      isConnected: connectionState === CONNECTION_STATES.CONNECTED,
      isConnecting: connectionState === CONNECTION_STATES.CONNECTING,
      isReconnecting: connectionState === CONNECTION_STATES.RECONNECTING,
      hasFailed: connectionState === CONNECTION_STATES.FAILED,
      retryCount,
      lastConnected,
      connectionQuality,
      canRetry: retryCount < retryConfigRef.current.maxRetries && connectionState !== CONNECTION_STATES.FAILED
    }
  }, [connectionState, retryCount, lastConnected, connectionQuality])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnectRef.current) {
      connect()
    }
    
    return () => {
      isManualCloseRef.current = true
      cleanup()
    }
  }, [connect])

  return {
    // Connection state
    connectionState,
    isConnected: connectionState === CONNECTION_STATES.CONNECTED,
    isConnecting: connectionState === CONNECTION_STATES.CONNECTING,
    isReconnecting: connectionState === CONNECTION_STATES.RECONNECTING,
    hasFailed: connectionState === CONNECTION_STATES.FAILED,
    
    // Connection info
    retryCount,
    lastConnected,
    connectionQuality,
    
    // Actions
    connect,
    disconnect,
    sendMessage,
    getConnectionInfo,
    
    // WebSocket reference (for advanced usage)
    ws: wsRef.current
  }
}