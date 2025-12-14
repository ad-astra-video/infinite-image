import React, { useState, useEffect } from 'react'
import { X, Settings } from 'lucide-react'

const DisplayNameModal = ({ isOpen, onClose, isAuthenticated, currentDisplayName }) => {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Load existing display name on mount
  useEffect(() => {
    if (isOpen) {
      const savedName = localStorage.getItem('userDisplayName')
      if (savedName) {
        setDisplayName(savedName)
      }
    }
  }, [isOpen])

  // Validate display name
  const validateDisplayName = (name) => {
    if (!name || name.trim().length === 0) {
      return 'Display name cannot be empty'
    }
    
    const trimmed = name.trim()
    
    if (trimmed.length < 3) {
      return 'Display name must be at least 3 characters'
    }
    
    if (trimmed.length > 20) {
      return 'Display name must be less than 20 characters'
    }
    
    // Allow alphanumeric characters, spaces, and some special characters
    if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(trimmed)) {
      return 'Display name can only contain letters, numbers, spaces, hyphens, underscores, and periods'
    }
    
    return null
  }

  const handleSave = () => {
    const validationError = validateDisplayName(displayName)
    
    if (validationError) {
      setError(validationError)
      setSuccess(false)
      return
    }
    
    const trimmedName = displayName.trim()
    localStorage.setItem('userDisplayName', trimmedName)
    
    setError('')
    setSuccess(true)
    
    // Close modal after successful save
    setTimeout(() => {
      onClose()
      setSuccess(false)
    }, 1500)
  }

  const handleClear = () => {
    localStorage.removeItem('userDisplayName')
    setDisplayName('')
    setError('')
    setSuccess(false)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Settings size={20} />
            Display Name Settings
          </h2>
          <button 
            className="close-btn"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          {!isAuthenticated && (
            <div className="auth-notice">
              <p>⚠️ Connect your wallet to set a display name that others will see.</p>
              <p>Without authentication, your display name will only be visible to you.</p>
            </div>
          )}
          
          <div className="form-group">
            <label>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setError('')
                setSuccess(false)
              }}
              className="input"
              placeholder="Enter your display name..."
              maxLength={20}
            />
            <div className="input-help">
              3-20 characters. Letters, numbers, spaces, hyphens, underscores, and periods allowed.
            </div>
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          {success && (
            <div className="success-message">
              ✅ Display name saved successfully!
            </div>
          )}
          
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={handleClear}
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!displayName.trim()}
            >
              Save Display Name
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DisplayNameModal
