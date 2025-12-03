import React, { useState, useEffect, useCallback } from 'react'

const API_BASE = ''

function SuperChat() {
  const [messages, setMessages] = useState([])

  const normalizeMessage = (m) => {
    if (!m) return null
    const msg = typeof m.msg === 'string' ? m.msg : (typeof m === 'string' ? m : String(m.msg ?? ''))
    const level = (typeof m.level === 'number' && Number.isFinite(m.level)) ? m.level : 0
    const ts = m.ts ?? 0
    return { msg, level, ts }
  }

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super/chat`)
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (!data) return

      const rawList = Array.isArray(data) ? data : (data.msg ? [data] : [])
      const normalized = rawList.map(normalizeMessage).filter(Boolean)

      // sort by level desc then timestamp desc
      normalized.sort((a, b) => (b.level - a.level) || (b.ts - a.ts))
      setMessages(normalized)
    } catch (err) {
      console.error('SuperChat fetch error:', err)
    }
  }, [])

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
              <span
                key={index}
                className={`ticker-message tier-${msg.level >= 10 ? 'gold' : (msg.level >= 5 ? 'silver' : 'bronze')}`}
              >
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