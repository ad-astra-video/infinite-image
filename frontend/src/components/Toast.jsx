import React, { useEffect, useState } from 'react'
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'

export function Toast({ 
  message, 
  type = 'info', 
  duration = 5000, 
  onClose, 
  show = false,
  action = null 
}) {
  const [isVisible, setIsVisible] = useState(show)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (show) {
      setIsVisible(true)
      setIsExiting(false)
    }
  }, [show])

  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      if (onClose) onClose()
    }, 300) // Match exit animation duration
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Info className="w-5 h-5 text-blue-500" />
    }
  }

  const getIconClass = () => {
    switch (type) {
      case 'success':
        return 'toast-icon success'
      case 'warning':
        return 'toast-icon warning'
      case 'error':
        return 'toast-icon error'
      default:
        return 'toast-icon info'
    }
  }

  if (!isVisible) return null

  return (
    <div className={`toast ${isExiting ? 'hidden' : ''}`}>
      <div className="toast-content">
        <div className={getIconClass()}>
          {getIcon()}
        </div>
        <div className="toast-text">
          <p>{message}</p>
          {action && (
            <div className="toast-action">
              {action}
            </div>
          )}
        </div>
        <button
          onClick={handleClose}
          className="toast-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function ToastContainer({ children }) {
  return (
    <div className="toast-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {children}
      </div>
    </div>
  )
}