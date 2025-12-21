import React, { useState, useEffect } from 'react'
import { X, Settings } from 'lucide-react'
import { getApiUrl } from '../utils/apiConfig'

const DisplayNameModal = ({ isOpen, onClose, isAuthenticated, currentDisplayName }) => {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  // Load existing display name on mount
  useEffect(() => {
    if (isOpen) {
      const savedName = localStorage.getItem('userDisplayName')
      if (savedName) {
        setDisplayName(savedName)
      }
    }
  }, [isOpen])

  // Verify ENS name ownership
  const verifyENSName = async (name) => {
    const query = `{
      domains(where: { owner: "0x104a7ca059a35fd4def5ecb16600b2caa1fe1361" }) {
        name
      }
    }`

    try {
      const response = await fetch(getApiUrl('/api/chat/verify-ens'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, ensName: name })
      })

      if (!response.ok) {
        throw new Error('Verification request failed')
      }

      const result = await response.json()
      const domains = result.data?.domains || []
      const domainNames = domains.map(domain => domain.name.toLowerCase())
      
      return domainNames.includes(name.toLowerCase())
    } catch (error) {
      console.error('ENS verification error:', error)
      return false
    }
  }

  // Validate display name
  const validateDisplayName = async (name) => {
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
    
    // Check if it's an ENS name (ends with .eth)
    if (trimmed.toLowerCase().endsWith('.eth')) {
      setIsVerifying(true)
      try {
        const isValidENS = await verifyENSName(trimmed)
        if (!isValidENS) {
          return 'Account does not own that ENS name'
        }
      } catch (error) {
        return 'Failed to verify ENS name ownership'
      } finally {
        setIsVerifying(false)
      }
    }
    
    return null
  }

  const handleSave = async () => {
    const validationError = await validateDisplayName(displayName)
    
    if (validationError) {
      setError(validationError)
      setSuccess('')
      return
    }
    
    const trimmedName = displayName.trim()
    localStorage.setItem('userDisplayName', trimmedName)
    
    setError('')
    setSuccess('Display name saved successfully!')
    
    // Close modal after successful save
    setTimeout(() => {
      onClose()
      setSuccess('')
    }, 1500)
  }

  const handleClear = () => {
    localStorage.removeItem('userDisplayName')
    setDisplayName('')
    setError('')
    setSuccess('')
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
                setSuccess('')
              }}
              className="input"
              placeholder="Enter your display name..."
              maxLength={20}
              disabled={isVerifying}
            />
            <div className="input-help">
              3-20 characters. Letters, numbers, spaces, hyphens, underscores, and periods allowed.
              {displayName.toLowerCase().endsWith('.eth') && (
                <div className="ens-notice">
                  🔗 ENS name detected - ownership will be verified
                </div>
              )}
            </div>
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          {success && (
            <div className="success-message">
              ✅ {success}
            </div>
          )}
          
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={handleClear}
              disabled={isVerifying}
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!displayName.trim() || isVerifying}
            >
              {isVerifying ? 'Verifying ENS...' : 'Save Display Name'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DisplayNameModal
