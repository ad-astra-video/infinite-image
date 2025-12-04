import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle, Users, Shield, Crown, Lock } from 'lucide-react'
import { useWallet } from './WalletConnect'

const API_BASE = 'http://localhost:4021'

function ChatInterface() {
  const wallet = useWallet()
  const [activeTab, setActiveTab] = useState('public')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [superChatMessage, setSuperChatMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [ws, setWs] = useState(null)
  const [userJoined, setUserJoined] = useState(false)
  const [lastMessageTime, setLastMessageTime] = useState(0)
  const [isSupporter, setIsSupporter] = useState(false)
  const messagesEndRef = useRef(null)
  const messageInputRef = useRef(null)
  const prevRoomRef = useRef(null)

  // Function to open tip jar from parent component
  const openTipJar = () => {
    // Dispatch custom event to open tip jar in main app
    window.dispatchEvent(new CustomEvent('openTipJar'))
  }

  const messageTypes = {
    public: { icon: Users, label: 'Public', color: 'blue' },
    supporter: { icon: Crown, label: 'Supporter', color: 'gold' }
  }

  // Helper function to truncate addresses
  const truncateAddress = (address) => {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Check supporter status via WebSocket
  const checkSupporterStatus = async (userAddress, userSignature) => {
    if (!ws || !userAddress || ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not ready for supporter check')
      return false
    }
    
    return new Promise((resolve) => {
      let timeoutId = setTimeout(() => {
        resolve(false)
      }, 3000)
      
      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'supporter_status' && data.userAddress === userAddress) {
            clearTimeout(timeoutId)
            setIsSupporter(data.isSupporter)
            resolve(data.isSupporter)
            ws.removeEventListener('message', handleMessage)
          }
        } catch (error) {
          console.error('Error parsing supporter status message:', error)
        }
      }
      
      ws.addEventListener('message', handleMessage)
      
      ws.send(JSON.stringify({
        type: 'is_supporter',
        userAddress,
        userSignature
      }))
    })
  }

  // Initialize WebSocket connection
  useEffect(() => {
    if (!ws) {
      const wsUrl = API_BASE.replace('http', 'ws') + '/ws'
      const newWs = new WebSocket(wsUrl)
      
      newWs.onopen = () => {
        console.log('Connected to chat server')
        setConnected(true)
      }
      
      newWs.onclose = (event) => {
        console.log('Disconnected from chat server, code:', event.code, 'reason:', event.reason)
        setConnected(false)
      }
      
      newWs.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      newWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Received message:', data)
          
          switch (data.type) {
            case 'connection':
              console.log('Connection established:', data.message)
              break
            case 'supporter_status':
              console.log('Supporter status:', data)
              if (data.userAddress === wallet.address || data.userAddress === wallet.loginAddress) {
                setIsSupporter(data.isSupporter)
              }
              break
            case 'chat_message':
              // Deduplicate server-echoed messages for ones we already optimistically added.
              setMessages(prev => {
                try {
                  // Look for a local optimistic message that matches by content and sender
                  const localIndex = prev.findIndex(m => m.id && m.id.toString().startsWith('local-') && m.content === data.content && m.sender === data.sender)
                  if (localIndex !== -1) {
                    // Replace the local optimistic message with the authoritative server message
                    const next = prev.slice()
                    next[localIndex] = data
                    return next
                  }
                } catch (err) {
                  console.warn('Failed to dedupe chat message:', err)
                }
                return [...prev, data]
              })
              break
            case 'user_joined':
              console.log('User joined:', data)
              break
            case 'user_left':
              console.log('User left:', data)
              break
            case 'error':
              console.error('WebSocket error:', data.message)
              alert(data.message)
              break
            case 'join_success':
              console.log('Join success:', data.message)
              break
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
      setWs(newWs)
      
      return () => {
        newWs.close()
      }
    }
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Join chat room when tab changes
  useEffect(() => {
    // Always join the chat room when WebSocket is ready, even for anonymous users.
    if (ws && connected && !userJoined) {
      const room = activeTab
      const userType = 'public'

      ws.send(JSON.stringify({
        type: 'join_chat',
        room,
        userAddress: wallet.address || 'anon',
        userType
      }))

      // remember the room we've joined so we can leave it later
      prevRoomRef.current = room
      setUserJoined(true)
    }
  }, [ws, connected, activeTab, userJoined])

  // Leave previous chat room when the active tab changes
  useEffect(() => {
    const prev = prevRoomRef.current
    // if there's a previously joined room and it's different from the current active tab, leave it
    if (ws && prev && prev !== activeTab) {
      ws.send(JSON.stringify({
        type: 'leave_chat',
        room: prev
      }))

      // clear remembered previous room and mark not joined so join effect can run for new room
      prevRoomRef.current = null
      setUserJoined(false)
    }
  }, [ws, activeTab])

  // Fetch initial messages when joining a room
  const fetchMessages = async (room) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/messages/${room}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error(`Failed to fetch ${room} messages:`, error)
    }
  }

  // Load messages when joining a room
  useEffect(() => {
    if (ws && userJoined) {
      fetchMessages(activeTab)
    }
  }, [ws, userJoined, activeTab])

  // Send public chat message
  const sendPublicMessage = async () => {
    if (!newMessage.trim() || !ws) return

    // Check rate limiting for non-wallet users
    const now = Date.now()
    const timeSinceLastMessage = now - lastMessageTime
    
    // Use wallet.isConnected instead of wallet.connected to ensure consistency
    if (!wallet.isConnected && timeSinceLastMessage < 60000) { // 1 minute = 60000ms
      const remainingTime = Math.ceil((60000 - timeSinceLastMessage) / 1000)
      alert(`Rate limit: Please wait ${remainingTime} seconds before sending another message`)
      return
    }

    setLoading(true)
    try {
      ws.send(JSON.stringify({
        type: 'chat_message',
        room: 'public',
        message: newMessage,
        messageType: 'public',
        userAddress: wallet.address || 'anon',
        userSignature: wallet.loginSignature || ''
      }))
      
      setNewMessage('')
      setLastMessageTime(now)
    } catch (error) {
      console.error('Failed to send public message:', error)
    }
    setLoading(false)
  }

  // Send supporter chat message with signature verification
  const sendSupporterChat = async () => {
    if (!superChatMessage.trim() || !wallet.isConnected || !ws) return

    // Check if we have a login signature from wallet context
    if (!wallet.loginSignature || !wallet.loginAddress) {
      alert('Please login with your wallet first to enable supporter chat functionality')
      return
    }

    setLoading(true)
    try {
      var msg = JSON.stringify({
        type: 'chat_message',
        room: 'supporter',
        message: superChatMessage,
        messageType: 'supporter',
        signature: wallet.loginSignature,
        address: wallet.loginAddress
      })

      ws.send(msg)
      
      setSuperChatMessage('')
    } catch (error) {
      console.error('Failed to send supporter chat:', error)
      alert('Failed to send supporter chat: ' + error.message)
    }
    setLoading(false)
  }

  // Get current active message input and send function
  const getCurrentInput = () => {
    switch (activeTab) {
      case 'public':
        return { value: newMessage, setValue: setNewMessage, send: sendPublicMessage }
      case 'supporter':
        return { value: superChatMessage, setValue: setSuperChatMessage, send: sendSupporterChat }
      default:
        return { value: newMessage, setValue: setNewMessage, send: sendPublicMessage }
    }
  }

  const currentInput = getCurrentInput()

  // Autosize textarea height based on content
  useEffect(() => {
    const el = messageInputRef.current
    if (!el) return
    // reset height to compute scrollHeight correctly
    el.style.height = 'auto'
    const newHeight = Math.min(el.scrollHeight, 140)
    el.style.height = `${newHeight}px`
  }, [newMessage, superChatMessage, activeTab])

  // Check supporter status when wallet connects or address changes
  useEffect(() => {
    if (wallet.isConnected && (wallet.address || wallet.loginAddress) && ws && connected) {
      const userAddress = wallet.address || wallet.loginAddress
      const userSignature = wallet.loginSignature || ''
      checkSupporterStatus(userAddress, userSignature)
    }
  }, [wallet.isConnected, wallet.address, wallet.loginAddress, ws, connected])

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="chat-title">
          <h3>Chat</h3>
          <span
            className={`connection-indicator ${connected ? 'connected' : 'disconnected'}`}
            title={connected ? 'Connected' : 'Disconnected'}
            aria-hidden="true"
          />
        </div>
        <div className="chat-tabs">
          {Object.entries(messageTypes).map(([key, type]) => {
            const Icon = type.icon
            return (
              <button
                key={key}
                className={`chat-tab ${activeTab === key ? 'active' : ''}`}
                onClick={async () => {
                  if (key === 'supporter' && wallet.isConnected) {
                    // Check if user has access to supporter chat via WebSocket
                    const userAddress = wallet.address || wallet.loginAddress
                    const userSignature = wallet.loginSignature || ''
                    if (userAddress) {
                      const hasTipped = await checkSupporterStatus(userAddress, userSignature)

                      if (!hasTipped) {
                        // Add error message to chat history
                        const errorMessage = {
                          id: `error-${Date.now()}`,
                          content: 'You need to tip to access Supporter Chat. Opening tip jar...',
                          sender: 'System',
                          senderType: 'system',
                          messageType: 'error',
                          timestamp: new Date().toISOString()
                        }
                        setMessages(prev => [...prev, errorMessage])
                        openTipJar() // Open existing tip jar in video player
                        return
                      }
                    }
                  }
                  
                  setActiveTab(key)
                  setUserJoined(false) // Reset to rejoin new room
                  setMessages([]) // Clear messages when switching tabs
                }}
              >
                <Icon size={16} />
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => {
          const isOwnMessage = wallet.address && message.sender === wallet.address
          return (
            <div key={message.id || index} className={`message-wrapper ${isOwnMessage ? 'own' : ''}`}>
              <div className="message-timestamp">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`message ${message.messageType} ${isOwnMessage ? 'own' : ''}`}>
                <div className="message-header">
                  <span className="sender">
                    {message.senderType === 'supporter' && <Crown size={14} />}
                    {truncateAddress(message.sender)}
                    {isOwnMessage && <span className="you-badge">You</span>}
                  </span>
                </div>
                <div className="message-content">
                  {message.content}
                  {message.messageType === 'supporter' && (
                    <span className="supporter-badge">Supporter Chat</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-inputs">
        {activeTab === 'supporter' && wallet.loginSignature && (
          <div className="login-success" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Logged in successfully
          </div>
        )}

        <div className="input-group">
          <textarea
            ref={messageInputRef}
            rows={2}
            placeholder={
              activeTab === 'supporter' ? "Enter supporter chat message..." :
              "Enter public message..."
            }
            value={currentInput.value}
            onChange={(e) => currentInput.setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                currentInput.send()
              }
            }}
            // Allow typing for public chat even when WebSocket isn't connected so users can draft messages.
            // For supporter chat, keep input disabled when not connected to avoid confusing payment flows.
            disabled={loading || (activeTab === 'supporter' && !connected)}
            className="message-input"
          />
          <button
            onClick={currentInput.send}
            // Public chat: enable send button even if WebSocket isn't connected so users can queue/draft messages.
            // Supporter chat: require connection to prevent accidental attempts without wallet/session.
            disabled={
              loading ||
              !currentInput.value.trim() ||
              (activeTab === 'supporter' && !connected)
            }
            className="send-button"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatInterface