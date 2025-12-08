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

  const getToastStyles = () => {
    const baseStyles = "fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-lg border transform transition-all duration-300 ease-in-out"
    
    if (!isVisible) {
      return `${baseStyles} translate-x-full opacity-0`
    }
    
    if (isExiting) {
      return `${baseStyles} translate-x-full opacity-0`
    }
    
    return `${baseStyles} translate-x-0 opacity-100`
  }

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return 'border-l-green-500 border-t border-r border-b border-gray-200'
      case 'warning':
        return 'border-l-yellow-500 border-t border-r border-b border-gray-200'
      case 'error':
        return 'border-l-red-500 border-t border-r border-b border-gray-200'
      default:
        return 'border-l-blue-500 border-t border-r border-b border-gray-200'
    }
  }

  if (!isVisible) return null

  return (
    <div className={getToastStyles()}>
      <div className={`p-4 ${getBorderColor()}`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {message}
            </p>
            {action && (
              <div className="mt-2">
                {action}
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={handleClose}
              className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ToastContainer({ children }) {
  return (
    <div className="fixed top-0 right-0 z-50 p-4 pointer-events-none">
      <div className="flex flex-col space-y-2">
        {children}
      </div>
    </div>
  )
}