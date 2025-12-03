import React, { useState, useEffect } from 'react'
import { Send, MessageCircle, Users, Shield, Crown, Lock } from 'lucide-react'
import { useWallet } from './WalletConnect'

const API_BASE = ''

function ChatInterface() {
  const wallet = useWallet()
  const [activeTab, setActiveTab] = useState('public')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [dmAddress, setDmAddress] = useState('')
  const [dmMessage, setDmMessage] = useState('')
  const [superChatAmount, setSuperChatAmount] = useState(1)
  const [superChatMessage, setSuperChatMessage] = useState('')
  const [directorMessage, setDirectorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const messageTypes = {
    public: { icon: Users, label: 'Public Chat', color: 'blue' },
    dm: { icon: MessageCircle, label: 'Direct Messages', color: 'green' },
    super: { icon: Crown, label: 'Super Chat', color: 'gold' },
    director: { icon: Shield, label: 'Director Chat', color: 'purple' }
  }

  // Fetch messages for each chat type
  const fetchMessages = async (type) => {
    try {
      const endpoint = type === 'public' ? '/api/super/chat' : `/api/messages/${type}`
      const response = await fetch(`${API_BASE}${endpoint}`)
      
      if (response.ok) {
        const data = await response.json()
        return data.messages || data || []
      }
      return []
    } catch (error) {
      console.error(`Failed to fetch ${type} messages:`, error)
      return []
    }
  }

  // Load messages when tab changes
  useEffect(() => {
    const loadMessages = async () => {
      const fetchedMessages = await fetchMessages(activeTab)
      setMessages(fetchedMessages)
    }
    loadMessages()
  }, [activeTab])

  // Send public chat message
  const sendPublicMessage = async () => {
    if (!newMessage.trim() || !wallet.connected) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/messages/public-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newMessage,
          metadata: {
            sender: wallet.address,
            timestamp: new Date().toISOString()
          }
        })
      })

      if (response.ok) {
        setNewMessage('')
        // Refresh messages
        const updatedMessages = await fetchMessages('public')
        setMessages(updatedMessages)
      }
    } catch (error) {
      console.error('Failed to send public message:', error)
    }
    setLoading(false)
  }

  // Send DM message
  const sendDM = async () => {
    if (!dmAddress.trim() || !dmMessage.trim() || !wallet.connected) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/messages/dm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          peerAddress: dmAddress,
          content: dmMessage,
          metadata: {
            sender: wallet.address,
            timestamp: new Date().toISOString()
          }
        })
      })

      if (response.ok) {
        setDmMessage('')
        // Refresh messages
        const updatedMessages = await fetchMessages('dm')
        setMessages(updatedMessages)
      }
    } catch (error) {
      console.error('Failed to send DM:', error)
    }
    setLoading(false)
  }

  // Send super chat with tip
  const sendSuperChat = async () => {
    if (!superChatMessage.trim() || !superChatAmount || !wallet.connected) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/messages/super-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: superChatMessage,
          tipAmount: superChatAmount,
          paymentVerification: {
            currency: 'USDC',
            amount: superChatAmount
          }
        })
      })

      if (response.ok) {
        setSuperChatMessage('')
        // Refresh messages
        const updatedMessages = await fetchMessages('super')
        setMessages(updatedMessages)
      }
    } catch (error) {
      console.error('Failed to send super chat:', error)
    }
    setLoading(false)
  }

  // Send director chat message
  const sendDirectorMessage = async () => {
    if (!directorMessage.trim() || !wallet.connected) return

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/messages/director-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: directorMessage,
          directorAuth: {
            directorId: wallet.address,
            permissions: ['broadcast', 'moderate']
          }
        })
      })

      if (response.ok) {
        setDirectorMessage('')
        // Refresh messages
        const updatedMessages = await fetchMessages('director')
        setMessages(updatedMessages)
      }
    } catch (error) {
      console.error('Failed to send director message:', error)
    }
    setLoading(false)
  }

  const renderMessage = (message, index) => {
    const type = activeTab
    const isOwn = message.sender === wallet.address
    
    return (
      <div key={index} className={`message ${type} ${isOwn ? 'own' : 'other'}`}>
        <div className="message-header">
          <span className="message-sender">
            {isOwn ? 'You' : message.sender?.substring(0, 8) + '...'}
          </span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="message-content">
          {message.content}
          {message.tip && (
            <div className="tip-badge">
              💰 ${message.tip.amount} {message.tip.currency}
            </div>
          )}
          {message.director && (
            <div className="director-badge">
              🎬 Director Message
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-interface glass">
      <div className="chat-header">
        <h3>Chat</h3>
        <div className="chat-tabs">
          {Object.entries(messageTypes).map(([key, type]) => {
            const Icon = type.icon
            return (
              <button
                key={key}
                className={`chat-tab ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} />
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="chat-content">
        {/* Messages Display */}
        <div className="messages-container">
          {messages.length > 0 ? (
            messages.map(renderMessage)
          ) : (
            <div className="no-messages">
              <MessageCircle size={24} />
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}
        </div>

        {/* Message Input Areas */}
        <div className="chat-inputs">
          {/* Public Chat Input */}
          {activeTab === 'public' && (
            <div className="input-section">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Send a public message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendPublicMessage()}
                  disabled={loading || !wallet.connected}
                />
                <button
                  onClick={sendPublicMessage}
                  disabled={loading || !newMessage.trim() || !wallet.connected}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {/* DM Input */}
          {activeTab === 'dm' && (
            <div className="input-section">
              <div className="dm-address-input">
                <input
                  type="text"
                  placeholder="Recipient address..."
                  value={dmAddress}
                  onChange={(e) => setDmAddress(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Send a direct message..."
                  value={dmMessage}
                  onChange={(e) => setDmMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendDM()}
                  disabled={loading || !wallet.connected}
                />
                <button
                  onClick={sendDM}
                  disabled={loading || !dmMessage.trim() || !dmAddress.trim() || !wallet.connected}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Super Chat Input */}
          {activeTab === 'super' && (
            <div className="input-section">
              <div className="super-chat-controls">
                <div className="amount-input">
                  <label>Tip Amount (USDC):</label>
                  <select
                    value={superChatAmount}
                    onChange={(e) => setSuperChatAmount(parseInt(e.target.value))}
                    disabled={loading}
                  >
                    <option value={1}>$1</option>
                    <option value={5}>$5</option>
                    <option value={10}>$10</option>
                    <option value={25}>$25</option>
                    <option value={50}>$50</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Send a super chat message..."
                  value={superChatMessage}
                  onChange={(e) => setSuperChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendSuperChat()}
                  disabled={loading || !wallet.connected}
                />
                <button
                  onClick={sendSuperChat}
                  disabled={loading || !superChatMessage.trim() || !superChatAmount || !wallet.connected}
                >
                  <Crown size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Director Chat Input */}
          {activeTab === 'director' && (
            <div className="input-section">
              <div className="director-info">
                <Lock size={16} />
                <span>Director Only - Authenticated users only</span>
              </div>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Send a director message..."
                  value={directorMessage}
                  onChange={(e) => setDirectorMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendDirectorMessage()}
                  disabled={loading || !wallet.connected}
                />
                <button
                  onClick={sendDirectorMessage}
                  disabled={loading || !directorMessage.trim() || !wallet.connected}
                >
                  <Shield size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInterface