import React, { createContext, useContext, useState } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

// Create context for toast functionality with default values
const ToastContext = createContext({
  showToast: () => {},
  hideToast: () => {}
});

export function useToastContext() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const showToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const notification = { id, message, type, duration };
    
    setNotifications(prev => [...prev, notification]);
    
    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }
    
    return id;
  };

  const hideToast = (id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      
      {/* Global Toast Container */}
      {notifications.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          width: '90%',
          maxWidth: '400px',
          pointerEvents: 'none'
        }}>
          {notifications.map((notification) => (
            <div
              key={notification.id}
              style={{
                pointerEvents: 'auto',
                marginBottom: '8px'
              }}
            >
              <div className="toast" style={{
                position: 'relative',
                transform: 'none',
                margin: '0 auto'
              }}>
                <div className="toast-content">
                  <div className={`toast-icon ${notification.type}`}>
                    {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {notification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                    {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    {notification.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                  </div>
                  <div className="toast-text">
                    <p>{notification.message}</p>
                  </div>
                  <button
                    onClick={() => hideToast(notification.id)}
                    className="toast-close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}