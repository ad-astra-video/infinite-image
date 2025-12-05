// API Configuration
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4021'

// API endpoints helper
export const getApiUrl = (endpoint) => {
  return `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}