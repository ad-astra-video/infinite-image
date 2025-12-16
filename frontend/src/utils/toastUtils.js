/**
 * Toast utility functions for centralized toast management
 * This provides a simple interface for showing toast messages throughout the app
 */

// Toast message types
export const ToastTypes = {
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info'
};

// Default durations for different toast types
export const ToastDurations = {
  SUCCESS: 3000,
  WARNING: 5000,
  ERROR: 8000,
  INFO: 4000
};

// Utility function to show toast messages
export const showToastMessage = (message, type = 'info', duration = 5000) => {
  // This would need to be implemented with a global state management solution
  // For now, components should use the useToastContext hook directly
  console.warn('showToastMessage should be used within a ToastProvider context');
};