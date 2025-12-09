import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle, Users, Shield, Crown, Lock, Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { useWallet } from './WalletConnect'
import { API_BASE } from '../utils/apiConfig'

function ChatInterface() {
  const wallet = useWallet()
  const [activeTab, setActiveTab] = useState('public')
  const [publicMessages, setPublicMessages] = useState([])
  const [supporterMessages, setSupporterMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [supporterChatMessage, setSupporterChatMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [ws, setWs] = useState(null)
  const [userJoined, setUserJoined] = useState(false)
  const [lastMessageTime, setLastMessageTime] = useState(0)
  const [isSupporter, setIsSupporter] = useState(false)
  const [tipSuccessAnimation, setTipSuccessAnimation] = useState(false)
  const [roomCounts, setRoomCounts] = useState({})
  const [cooldownTimer, setCooldownTimer] = useState(0)
  const [cooldownInterval, setCooldownInterval] = useState(null)
  const [showChatInput, setShowChatInput] = useState(true)
  const [isMobileChatExpanded, setIsMobileChatExpanded] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const messagesEndRef = useRef(null)
  const messageInputRef = useRef(null)
  const prevRoomRef = useRef(null)

  // Function to start cooldown timer for anonymous users
  const startCooldownTimer = (seconds) => {
    setCooldownTimer(seconds)
    if (cooldownInterval) {
      clearInterval(cooldownInterval)
    }
    
    const interval = setInterval(() => {
      setCooldownTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setCooldownInterval(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    setCooldownInterval(interval)
  }

  // Function to open tip jar from parent component
  const openTipJar = () => {
    // Dispatch custom event to open tip jar in main app
    window.dispatchEvent(new CustomEvent('openTipJar'))
  }

  // Listen for tip success events
  useEffect(() => {
    const handleTipSuccess = () => {
      setIsSupporter(true)
      setTipSuccessAnimation(true)
      // Remove animation after 3 seconds
      setTimeout(() => {
        setTipSuccessAnimation(false)
      }, 3000)
    }

    window.addEventListener('tipSuccess', handleTipSuccess)
    return () => window.removeEventListener('tipSuccess', handleTipSuccess)
  }, [])

  const messageTypes = {
    public: { icon: Users, label: 'Public', color: 'blue' },
    supporter: { icon: Crown, label: 'Supporter', color: 'gold' }
  }

  // Listen for wallet authentication state changes to trigger supporter check
  useEffect(() => {
    if (wallet.enhancedAuth?.authenticated && wallet.address) {
      console.log('Wallet authenticated, triggering supporter status check')
      // Add a small delay to ensure SIWE verification and delegation storage completes
      setTimeout(() => {
        checkSupporterStatus(wallet.address)
      }, 1000)
    }
  }, [wallet.enhancedAuth?.authenticated, wallet.address])

  // Helper function to truncate addresses
  const truncateAddress = (address) => {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Helper function to detect mobile screens
  const isMobile = () => {
    return window.innerWidth <= 768
  }

  // Check supporter status via WebSocket
  const checkSupporterStatus = async (userAddress) => {
    if (!ws || !userAddress || ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not ready for supporter check')
      return false
    }
    
    // Check if wallet and ephemeral manager are properly initialized
    if (!wallet || !wallet.isConnected || !userAddress) {
      console.log('Wallet not ready for supporter check')
      return false
    }
    
    // Sign message with ephemeral key if available
    let userSignature = ''
    let signingSuccess = false
    
    if (wallet.signWithEphemeralKey && wallet.ephemeralManager) {
      try {
        // Check if ephemeral manager is ready
        if (!wallet.ephemeralManager.isReady()) {
          console.log('Ephemeral manager not ready, skipping supporter check')
          setIsSupporter(false)
          return false
        }
        
        const signatureData = `supporter_check_${userAddress}`
        const { signature } = await wallet.signWithEphemeralKey(signatureData)
        userSignature = signature
        signingSuccess = true
      } catch (error) {
        console.warn('Ephemeral signing failed:', error)
        signingSuccess = false
      }
    } else {
      console.log('Ephemeral manager not available, skipping supporter check')
      setIsSupporter(false)
      return false
    }
    
    // Only send supporter check if we have a valid signature
    if (signingSuccess && userSignature) {
      ws.send(JSON.stringify({
        type: 'is_supporter',
        userAddress,
        userSignature
      }))
      return true
    } else {
      console.log('Skipping supporter check due to signing failure or missing signature')
      // Set isSupporter to false since we can't verify
      setIsSupporter(false)
      return false
    }
  }

  // Initialize WebSocket connection
  useEffect(() => {
    if (!ws) {
      const wsUrl = API_BASE.replace('http', 'ws') + '/chat'
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
          //console.log('Received message:', data)
          
          switch (data.type) {
            case 'connection':
              console.log('Connection established:', data.message)``
              break
            case 'chat_history':
              //console.log('Received historical messages:', data.messages.length)
              
              // Add historical messages to the appropriate message state based on room
              if (data.room === 'public') {
                setPublicMessages(prev => {
                  try {
                    // Filter out any duplicate messages that might already exist
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMessages = data.messages.filter(m => !existingIds.has(m.id))
                    
                    // Sort messages by timestamp to maintain chronological order
                    const allMessages = [...prev, ...newMessages].sort((a, b) =>
                      new Date(a.timestamp) - new Date(b.timestamp)
                    )
                    
                    return allMessages
                  } catch (err) {
                    console.warn('Failed to process public historical messages:', err)
                    return [...prev, ...data.messages]
                  }
                })
              } else if (data.room === 'supporter') {
                setSupporterMessages(prev => {
                  try {
                    // Filter out any duplicate messages that might already exist
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMessages = data.messages.filter(m => !existingIds.has(m.id))
                    
                    // Sort messages by timestamp to maintain chronological order
                    const allMessages = [...prev, ...newMessages].sort((a, b) =>
                      new Date(a.timestamp) - new Date(b.timestamp)
                    )
                    
                    return allMessages
                  } catch (err) {
                    console.warn('Failed to process supporter historical messages:', err)
                    return [...prev, ...data.messages]
                  }
                })
              }
              
              // Update lastMessageTime if we received historical messages
              if (data.messages && data.messages.length > 0) {
                const lastMessage = data.messages[data.messages.length - 1]
                setLastMessageTime(new Date(lastMessage.timestamp).getTime())
              }
              break
            case 'chat_message':
              // Deduplicate server-echoed messages for ones we already optimistically added.
              // Handle both messageType (legacy) and room (current) fields from server
              const messageType = data.messageType || data.room || 'public'
              
              if (messageType === 'public') {
                setPublicMessages(prev => {
                  try {
                    // Map server fields to frontend fields for deduplication
                    const serverMessage = {
                      ...data,
                      sender: data.userAddress || data.sender,
                      content: data.message || data.content
                    }
                    
                    // Look for a local optimistic message that matches by content and sender
                    const localIndex = prev.findIndex(m => {
                      if (!m.id || !m.id.toString().startsWith('local-')) return false
                      const localMessage = {
                        sender: m.userAddress || m.sender,
                        content: m.message || m.content
                      }
                      return localMessage.content === serverMessage.content && localMessage.sender === serverMessage.sender
                    })
                    
                    if (localIndex !== -1) {
                      // Replace the local optimistic message with the authoritative server message
                      const next = prev.slice()
                      next[localIndex] = data
                      return next
                    }
                  } catch (err) {
                    console.warn('Failed to dedupe public chat message:', err)
                  }
                  const newMessages = [...prev, data]
                  // Track unread messages for mobile
                  if (isMobile() && !isMobileChatExpanded) {
                    setUnreadMessageCount(prev => prev + 1)
                  }
                  return newMessages
                })
              } else if (messageType === 'supporter') {
                setSupporterMessages(prev => {
                  try {
                    // Map server fields to frontend fields for deduplication
                    const serverMessage = {
                      ...data,
                      sender: data.userAddress || data.sender,
                      content: data.message || data.content
                    }
                    
                    // Look for a local optimistic message that matches by content and sender
                    const localIndex = prev.findIndex(m => {
                      if (!m.id || !m.id.toString().startsWith('local-')) return false
                      const localMessage = {
                        sender: m.userAddress || m.sender,
                        content: m.message || m.content
                      }
                      return localMessage.content === serverMessage.content && localMessage.sender === serverMessage.sender
                    })
                    
                    if (localIndex !== -1) {
                      // Replace the local optimistic message with the authoritative server message
                      const next = prev.slice()
                      next[localIndex] = data
                      return next
                    }
                  } catch (err) {
                    console.warn('Failed to dedupe supporter chat message:', err)
                  }
                  const newMessages = [...prev, data]
                  // Track unread messages for mobile
                  if (isMobile() && !isMobileChatExpanded) {
                    setUnreadMessageCount(prev => prev + 1)
                  }
                  return newMessages
                })
              } else if (messageType === 'tip') {
                // Handle tip messages - broadcast to public chat with gold styling
                setPublicMessages(prev => {
                  try {
                    const tipMessage = {
                      ...data,
                      sender: data.userAddress || data.sender,
                      content: data.message || data.content,
                      messageType: 'tip'
                    }
                    const newMessages = [...prev, tipMessage]
                    // Track unread messages for mobile
                    if (isMobile() && !isMobileChatExpanded) {
                      setUnreadMessageCount(prev => prev + 1)
                    }
                    return newMessages
                  } catch (err) {
                    console.warn('Failed to process tip message:', err)
                    return [...prev, data]
                  }
                })
              }
              
              // Update lastMessageTime for new chat messages
              setLastMessageTime(new Date(data.timestamp).getTime())
              break
            case 'supporter_status':
              // Fix: Normalize addresses to lowercase for comparison
              const normalizedWalletAddress = (wallet.address || '').toLowerCase()
              const normalizedLoginAddress = (wallet.loginAddress || '').toLowerCase()
              
              if (data.userAddress === normalizedWalletAddress || data.userAddress === normalizedLoginAddress) {
                // Trigger tip success animation when supporter status becomes true
                if (data.isSupporter && !isSupporter) {
                  setIsSupporter(data.isSupporter)
                  setTipSuccessAnimation(true)
                  // Remove animation after 3 seconds
                  setTimeout(() => {
                    setTipSuccessAnimation(false)
                  }, 3000)
                  
                  // Automatically join supporter chat when status becomes true
                  console.log('Supporter status confirmed, automatically joining supporter chat')
                  if (ws && connected) {
                    // Leave current room first if we're in a different room
                    const currentRoom = prevRoomRef.current
                    if (currentRoom && currentRoom !== 'supporter') {
                      ws.send(JSON.stringify({
                        type: 'leave_chat',
                        room: currentRoom
                      }))
                    }
                    
                    // Join supporter chat room
                    ws.send(JSON.stringify({
                      type: 'join_chat',
                      room: 'supporter',
                      userAddress: wallet.address || 'anon',
                      userType: 'supporter',
                      userSignature: '',
                      lastMessageTime: lastMessageTime || null
                    }))
                    
                    // Remember that we're now in supporter room
                    prevRoomRef.current = 'supporter'
                    setUserJoined(true)
                    
                    // Switch to supporter tab to show the chat
                    setActiveTab('supporter')
                  }
                }
                
                // Only remove system messages if user is already a supporter
                // This prevents race conditions during initial checks
                if (data.isSupporter) {
                  setSupporterMessages(prev =>
                    prev.filter(message =>
                      message.senderType !== 'system' &&
                      message.messageType !== 'error'
                    )
                  )
                }
              }
              break
            case 'user_joined':
              //console.log('User joined:', data)

              // Store room count for display
              if (data.room && data.roomCount) {
                setRoomCounts(prev => ({
                  ...prev,
                  [data.room]: data.roomCount
                }))
              }
              break
            case 'user_left':
              //console.log('User left:', data)

              // Update room count for display
              if (data.room) {
                setRoomCounts(prev => ({
                  ...prev,
                  [data.room]: Math.max(0, (prev[data.room] || 0) - 1)
                }))
              }
              break
            case 'user_address_updated':
              //console.log('User address updated:', data)

              // Update display name for the user who updated their address
              // This helps show the updated address in the UI
              break
            case 'rate_limit':
              //console.log('Rate limit response received:', data)

              if (data.nextMessageTime) {
                console.log('Starting cooldown timer for:', data.nextMessageTime, 'seconds')
                startCooldownTimer(data.nextMessageTime)
              }
              break
            case 'join_success':
              //console.log('Join success:', data.message)
              break
            case 'error':
              console.error('WebSocket error:', data.error)
              alert(data.error)
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
    const messagesContainer = document.querySelector('.messages-container')
    if (messagesContainer) {
      // Only auto-scroll if user is near the bottom (within 50px) or it's a new message
      const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 50
      
      if (isNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight
      }
    }
  }, [publicMessages, supporterMessages])

  // Join chat room when tab changes
  useEffect(() => {
    // Wait for SIWE authentication to complete before joining chat
    if (ws && connected && wallet.isConnected) {
      const room = activeTab
      let userType = 'public'
      
      // Use local isSupporter state as primary source of truth
      if (isSupporter) {
        userType = 'supporter'
      } else if (wallet.isSupporter) {
        userType = 'supporter'
      }

      if (room === 'supporter' && !isSupporter && !wallet.isSupporter) {
        console.log('Cannot join supporter chat, user is not a supporter')
        return
      }

      console.log('Joining chat:', {
        siweValidated: wallet.siweValidated,
        isConnected: wallet.isConnected,
        isSupporter: isSupporter,
        userType
      })

      ws.send(JSON.stringify({
        type: 'join_chat',
        room,
        userAddress: wallet.address || 'anon',
        userType,
        userSignature: '',
        lastMessageTime: lastMessageTime || null
      }))

      // remember the room we've joined so we can leave it later
      prevRoomRef.current = room
      setUserJoined(true)
    }
  }, [ws, connected, activeTab, userJoined, lastMessageTime, wallet.isConnected, isSupporter, wallet.isSupporter])

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

  // Force rejoin supporter chat when supporter status changes
  useEffect(() => {
    if (activeTab === 'supporter' && isSupporter && ws && connected && userJoined) {
      const currentRoom = prevRoomRef.current
      if (currentRoom !== 'supporter') {
        console.log('Supporter status changed, rejoining supporter chat room')
        // Leave current room first
        if (currentRoom) {
          ws.send(JSON.stringify({
            type: 'leave_chat',
            room: currentRoom
          }))
        }
        // Join supporter room
        ws.send(JSON.stringify({
          type: 'join_chat',
          room: 'supporter',
          userAddress: wallet.address || 'anon',
          userType: 'supporter',
          userSignature: '',
          lastMessageTime: lastMessageTime || null
        }))
        prevRoomRef.current = 'supporter'
      }
    }
  }, [isSupporter, activeTab, ws, connected, userJoined, lastMessageTime, wallet.address])

  // Load messages when joining a room - WebSocket handles this automatically
  useEffect(() => {
    if (ws && userJoined) {
      // Historical messages are sent automatically via WebSocket when joining
      console.log('Joining room via WebSocket, historical messages will be delivered automatically')
    }
  }, [ws, userJoined, activeTab])

  // Send public chat message
  const sendPublicMessage = async () => {
    if (!newMessage.trim() || !ws) return

    // Removed client-side timeout check - let server handle all timeout logic for anonymous users
    // Rate limiting is now handled entirely by the server via rate_limit response

    setLoading(true)
    try {
      // Sign message with ephemeral key if available
      let messageData = {
        type: 'chat_message',
        room: 'public',
        message: newMessage,
        messageType: 'public',
        userAddress: wallet.address || 'anon'
      }

      // Add ephemeral signature if wallet supports it
      if (wallet.signWithEphemeralKey && wallet.ephemeralManager) {

        try {
          const { signature, counter } = await wallet.signWithEphemeralKey(newMessage)
          messageData = {
            ...messageData,
            signature: signature,
            counter: counter
          }
        } catch (ephemeralError) {
          console.error('Public message ephemeral signing failed:', {
            error: ephemeralError.message,
            ephemeralManagerReady: wallet.ephemeralManager?.isReady(),
            hasSignMethod: !!wallet.signWithEphemeralKey
          })
        }
      }

      // Add counter always zero for anonymous users and blank signature
      if (!wallet.isConnected) {
        messageData = {
          ...messageData,
          counter: 0, // Always zero for anonymous users
          signature: 'none' // default signature value for anonymous users
        }
      }

      // public messages can be sent without wallet connected
      ws.send(JSON.stringify(messageData))
      
      setNewMessage('')
      setLastMessageTime(Date.now())
    } catch (error) {
      console.error('Failed to send public message:', error)
    }
    setLoading(false)
  }

  // Send supporter chat message with signature verification
  const sendSupporterChat = async () => {    
    if (!supporterChatMessage.trim() || !wallet.isConnected || !ws) return

    // Check if we have a login signature from wallet contexts
    if (!wallet.loginAddress) {
      //alert('Please login with your wallet first to enable supporter chat functionality')
      return
    }

    setLoading(true)
    try {
      // Sign message with ephemeral key if available
      let messageData = {
        type: 'chat_message',
        room: 'supporter',
        message: supporterChatMessage,
        messageType: 'supporter'
      }

      // Add ephemeral signature if wallet supports it
      if (wallet.signWithEphemeralKey && wallet.ephemeralManager) {
        try {
          const { signature, counter } = await wallet.signWithEphemeralKey(supporterChatMessage)
          messageData = {
            ...messageData,
            signature: signature,
            counter: counter
          }
        } catch (ephemeralError) {
          console.error('Ephemeral signing failed:', {
            error: ephemeralError.message,
            ephemeralManagerReady: wallet.ephemeralManager?.isReady(),
            hasSignMethod: !!wallet.signWithEphemeralKey
          })
          // Don't send message if ephemeral signing fails - this prevents the counter undefined error
          setLoading(false)
          return
        }
      }

      // Send supporter chat message (with or without signature)
      ws.send(JSON.stringify(messageData))
      
      setSupporterChatMessage('')
      setLastMessageTime(Date.now())

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
        return { value: supporterChatMessage, setValue: setSupporterChatMessage, send: sendSupporterChat }
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
  }, [newMessage, supporterChatMessage, activeTab])

  // Consolidated supporter status checking - only check when on supporter tab
  useEffect(() => {
    // Only check supporter status when:
    // 1. User switches to supporter tab AND wallet is connected
    // 2. Wallet connects while on supporter tab
    // 3. Address changes while on supporter tab
    if (activeTab === 'supporter' && wallet.isConnected && (wallet.address || wallet.loginAddress) && ws && connected) {
      const userAddress = wallet.address || wallet.loginAddress
      checkSupporterStatus(userAddress)
    }
  }, [activeTab, wallet.isConnected, wallet.address, wallet.loginAddress, ws, connected])

  // Handle non-supporter system messages for supporter tab access - only once per session
  useEffect(() => {
    if (activeTab === 'supporter' && wallet.isConnected && !isSupporter) {
      // Check if we haven't already shown the error message for this session
      const hasShownError = supporterMessages.some(msg => msg.messageType === 'error' && msg.senderType === 'system')
      if (!hasShownError) {
        const errorMessage = {
          id: `error-${Date.now()}`,
          content: 'You need to tip to access Supporter Chat. Opening tip jar...',
          sender: 'System',
          senderType: 'system',
          messageType: 'error',
          timestamp: new Date().toISOString()
        }
        setSupporterMessages(prev => [...prev, errorMessage])
        openTipJar() // Open tip jar in video player
      }
    }
  }, [activeTab, wallet.isConnected, isSupporter, supporterMessages])

  // Auto-cleanup system messages that are older than 15 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      
      // Clean up public chat system messages
      setPublicMessages(prev =>
        prev.filter(message => {
          if (message.senderType === 'system') {
            const messageTime = new Date(message.timestamp).getTime()
            const ageInSeconds = (now - messageTime) / 1000
            // Remove system messages older than 3 seconds
            return ageInSeconds < 3
          }
          return true
        })
      )
      
      // Clean up supporter chat system messages
      setSupporterMessages(prev =>
        prev.filter(message => {
          if (message.senderType === 'system') {
            const messageTime = new Date(message.timestamp).getTime()
            const ageInSeconds = (now - messageTime) / 1000
            // Remove system messages older than 3 seconds
            return ageInSeconds < 3
          }
          return true
        })
      )
    }, 5000) // Check every 5 seconds
    
    return () => clearInterval(cleanupInterval)
  }, [])

  return (
    <>
      {/* Desktop Chat Interface */}
      <div className={`chat-interface ${isMobile() ? 'mobile-hidden' : ''}`}>
        <div className="chat-header">
          <div className="chat-header-left">
            <span
              className={`connection-indicator ${connected ? 'connected' : 'disconnected'}`}
              title={connected ? 'Connected' : 'Disconnected'}
              aria-hidden="true"
            />
            {/* Hide expand/hide button on larger screens */}
            {!isMobile() && (
              <button
                className="chat-input-toggle"
                onClick={() => setShowChatInput(!showChatInput)}
                title={showChatInput ? 'Hide chat input' : 'Show chat input'}
              >
                {showChatInput ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
          <div className="chat-tabs">
            {Object.entries(messageTypes).map(([key, type]) => {
              const Icon = type.icon
              const isSupporterTab = key === 'supporter'
              const showGoldAnimation = isSupporterTab && tipSuccessAnimation
              const showGoldPermanent = isSupporterTab && isSupporter && !tipSuccessAnimation
              
              // Disable supporter tab when wallet is not connected
              const isDisabled = isSupporterTab && !wallet.isConnected
              
              return (
                <button
                  key={key}
                  className={`chat-tab ${activeTab === key ? 'active' : ''} ${showGoldAnimation ? 'gold-shine' : ''} ${showGoldPermanent ? 'gold-permanent' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={async () => {
                    if (!isDisabled) {
                      setActiveTab(key)
                      setUserJoined(false) // Reset to rejoin new room
                    }
                  }}
                  disabled={isDisabled}
                >
                  <div className="room-count-badge">
                    {roomCounts[key] || 0}
                  </div>
                  <Icon size={16} className="chat-tab-icon" />
                  {isDisabled && <Lock size={12} className="lock-icon" />}
                </button>
              )
            })}
          </div>
        </div>

      <div className="messages-container">
        {activeTab === 'public' && publicMessages.map((message, index) => {
          // Map server fields to frontend fields for compatibility
          const mappedMessage = {
            ...message,
            sender: message.userAddress || message.sender, // Use userAddress from server, fallback to sender
            senderType: message.userType || message.senderType, // Use userType from server, fallback to senderType
            content: message.message || message.content // Use message from server, fallback to content
          }
          
          const isOwnMessage = wallet.address && mappedMessage.sender === (wallet.address || '').toLowerCase()
          const isTipMessage = mappedMessage.messageType === 'tip'
          
          return (
            <div key={mappedMessage.id || index} className={`message-wrapper ${isOwnMessage ? 'own' : ''} ${isTipMessage ? 'tip-message' : ''}`}>
              <div className="message-timestamp">
                {new Date(mappedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`message ${mappedMessage.messageType || 'public'} ${isOwnMessage ? 'own' : ''} ${isTipMessage ? 'tip' : ''}`}>
                <div className="message-header">
                  <span className="sender">
                    {(mappedMessage.senderType === 'supporter' || isTipMessage) && <Crown size={14} />}
                    {truncateAddress(mappedMessage.sender)}
                    {isOwnMessage && <span className="you-badge">You</span>}
                  </span>
                </div>
                <div className="message-content">
                  {mappedMessage.content}
                  {isTipMessage && <span className="tip-announcement">🎉 Tip received!</span>}
                </div>
              </div>
            </div>
          )
        })}
        {activeTab === 'supporter' && supporterMessages.map((message, index) => {
          // Map server fields to frontend fields for compatibility
          const mappedMessage = {
            ...message,
            sender: message.userAddress || message.sender, // Use userAddress from server, fallback to sender
            senderType: message.userType || message.senderType, // Use userType from server, fallback to senderType
            content: message.message || message.content // Use message from server, fallback to content
          }
          
          const isOwnMessage = wallet.address && mappedMessage.sender === (wallet.address || '').toLowerCase()
          return (
            <div key={mappedMessage.id || index} className={`message-wrapper ${isOwnMessage ? 'own' : ''}`}>
              <div className="message-timestamp">
                {new Date(mappedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`message ${mappedMessage.messageType || 'supporter'} ${isOwnMessage ? 'own' : ''}`}>
                <div className="message-header">
                  <span className="sender">
                    {mappedMessage.senderType === 'supporter' && <Crown size={14} />}
                    {truncateAddress(mappedMessage.sender)}
                    {isOwnMessage && <span className="you-badge">You</span>}
                  </span>
                </div>
                <div className="message-content">
                  {mappedMessage.content}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className={`chat-inputs ${!showChatInput ? 'hidden' : ''}`}>
        {/* Cooldown Timer Display for Anonymous Users */}
        {!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0 && (
          <div className="cooldown-timer">
            <div className="cooldown-message">
              <Clock size={16} className="cooldown-icon" />
              <span>Rate limit: Please wait {cooldownTimer} seconds before sending another message</span>
            </div>
          </div>
        )}
        
        {showChatInput && (
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
              disabled={loading || (activeTab === 'supporter' && !connected) || (!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0)}
              className="message-input"
            />
            <button
              onClick={currentInput.send}
              // Public chat: enable send button even if WebSocket isn't connected so users can queue/draft messages.
              // Supporter chat: require connection to prevent accidental attempts without wallet/session.
              disabled={
                loading ||
                !currentInput.value.trim() ||
                (activeTab === 'supporter' && !connected) ||
                (activeTab === 'supporter' && !isSupporter) ||
                (!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0)
              }
              className="send-button"
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
      </div>
      
      {/* Mobile Chat Bar at Bottom */}
      {isMobile() && (
        <div className="mobile-chat-bar">
          <button
            className="mobile-chat-expand-btn"
            onClick={() => {
              setIsMobileChatExpanded(true)
              setUnreadMessageCount(0) // Reset unread count when opening chat
            }}
            title="Open chat"
          >
            <MessageCircle size={20} />
            <span className="mobile-chat-label">Chat</span>
            {unreadMessageCount > 0 && (
              <div className="mobile-chat-badge">
                {unreadMessageCount}
              </div>
            )}
          </button>
        </div>
      )}

      {/* Mobile Chat Expanded Overlay */}
      {isMobile() && isMobileChatExpanded && (
        <div className="mobile-chat-overlay" onClick={() => setIsMobileChatExpanded(false)}>
          <div className="mobile-chat-expanded" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-chat-header">
              <div className="mobile-chat-header-left">
                <span
                  className={`connection-indicator ${connected ? 'connected' : 'disconnected'}`}
                  title={connected ? 'Connected' : 'Disconnected'}
                  aria-hidden="true"
                />
                <button
                  className="mobile-chat-close-btn"
                  onClick={() => setIsMobileChatExpanded(false)}
                  title="Close chat"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="mobile-chat-tabs">
                {Object.entries(messageTypes).map(([key, type]) => {
                  const Icon = type.icon
                  const isSupporterTab = key === 'supporter'
                  const showGoldAnimation = isSupporterTab && tipSuccessAnimation
                  const showGoldPermanent = isSupporterTab && isSupporter && !tipSuccessAnimation
                  
                  // Disable supporter tab when wallet is not connected
                  const isDisabled = isSupporterTab && !wallet.isConnected
                  
                  return (
                    <button
                      key={key}
                      className={`mobile-chat-tab ${activeTab === key ? 'active' : ''} ${showGoldAnimation ? 'gold-shine' : ''} ${showGoldPermanent ? 'gold-permanent' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={async () => {
                        if (!isDisabled) {
                          setActiveTab(key)
                          setUserJoined(false)
                        }
                      }}
                      disabled={isDisabled}
                    >
                      <div className="room-count-badge">
                        {roomCounts[key] || 0}
                      </div>
                      <Icon size={16} className="chat-tab-icon" />
                      {isDisabled && <Lock size={12} className="lock-icon" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mobile-messages-container">
              {activeTab === 'public' && publicMessages.map((message, index) => {
                const mappedMessage = {
                  ...message,
                  sender: message.userAddress || message.sender,
                  senderType: message.userType || message.senderType,
                  content: message.message || message.content
                }
                
                const isOwnMessage = wallet.address && mappedMessage.sender === (wallet.address || '').toLowerCase()
                const isTipMessage = mappedMessage.messageType === 'tip'
                
                return (
                  <div key={mappedMessage.id || index} className={`message-wrapper ${isOwnMessage ? 'own' : ''} ${isTipMessage ? 'tip-message' : ''}`}>
                    <div className="message-timestamp">
                      {new Date(mappedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className={`message ${mappedMessage.messageType || 'public'} ${isOwnMessage ? 'own' : ''} ${isTipMessage ? 'tip' : ''}`}>
                      <div className="message-header">
                        <span className="sender">
                          {(mappedMessage.senderType === 'supporter' || isTipMessage) && <Crown size={14} />}
                          {truncateAddress(mappedMessage.sender)}
                          {isOwnMessage && <span className="you-badge">You</span>}
                        </span>
                      </div>
                      <div className="message-content">
                        {mappedMessage.content}
                        {isTipMessage && <span className="tip-announcement">🎉 Tip received!</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
              {activeTab === 'supporter' && supporterMessages.map((message, index) => {
                const mappedMessage = {
                  ...message,
                  sender: message.userAddress || message.sender,
                  senderType: message.userType || message.senderType,
                  content: message.message || message.content
                }
                
                const isOwnMessage = wallet.address && mappedMessage.sender === (wallet.address || '').toLowerCase()
                return (
                  <div key={mappedMessage.id || index} className={`message-wrapper ${isOwnMessage ? 'own' : ''}`}>
                    <div className="message-timestamp">
                      {new Date(mappedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className={`message ${mappedMessage.messageType || 'supporter'} ${isOwnMessage ? 'own' : ''}`}>
                      <div className="message-header">
                        <span className="sender">
                          {mappedMessage.senderType === 'supporter' && <Crown size={14} />}
                          {truncateAddress(mappedMessage.sender)}
                          {isOwnMessage && <span className="you-badge">You</span>}
                        </span>
                      </div>
                      <div className="message-content">
                        {mappedMessage.content}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="mobile-chat-inputs">
              {!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0 && (
                <div className="cooldown-timer">
                  <div className="cooldown-message">
                    <Clock size={16} className="cooldown-icon" />
                    <span>Rate limit: Please wait {cooldownTimer} seconds before sending another message</span>
                  </div>
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
                  disabled={loading || (activeTab === 'supporter' && !connected) || (!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0)}
                  className="message-input"
                />
                <button
                  onClick={currentInput.send}
                  disabled={
                    loading ||
                    !currentInput.value.trim() ||
                    (activeTab === 'supporter' && !connected) ||
                    (activeTab === 'supporter' && !isSupporter) ||
                    (!wallet.isConnected && activeTab === 'public' && cooldownTimer > 0)
                  }
                  className="send-button"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ChatInterface