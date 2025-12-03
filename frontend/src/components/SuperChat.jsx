import React, { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = ''

function SuperChat() {
  const [messages, setMessages] = useState([])
  const lastSerializedRef = useRef('')

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super/chat`)
      if (!res.ok) {
        // non-fatal: server may not have any messages yet
        return
      }

      const data = await res.json().catch(() => null)
      if (!data) return

      // Server may return either a single message object `{ msg, level, ... }`
      // or an array of messages. Append new messages while avoiding simple duplicates.
      setMessages(prev => {
        const out = Array.isArray(prev) ? [...prev] : []

        const pushIfNew = (m) => {
          if (!m) return
          const last = out.length ? out[out.length - 1] : null
          if (last && last.msg === m.msg && last.level === m.level) return
          out.push(m)
        }

        if (Array.isArray(data)) {
          data.forEach(pushIfNew)
        } else if (data.msg) {
          pushIfNew(data)
        }

        // Cheap duplicate check using the last message signature to avoid expensive JSON.stringify
        const newLast = out.length ? `${out[out.length - 1].msg}::${out[out.length - 1].level}` : ''
        if (newLast === lastSerializedRef.current) {
          return prev
        }
        lastSerializedRef.current = newLast

        return out
      })
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }, [])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  return (
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
  )
}

export default SuperChat