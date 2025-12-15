import React from 'react'

function WebSocketStatus({ 
  connectionState, 
  className = '' 
}) {
  const getCircleColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      case 'disconnected':
      default:
        return 'bg-gray-400'
    }
  }

  const circleColor = getCircleColor()

  return (
    <div className={`websocket-status ${className}`}>
      <div className={`w-4 h-4 rounded-full ${circleColor}`}></div>
    </div>
  )
}

export default WebSocketStatus