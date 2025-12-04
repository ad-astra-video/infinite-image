import React, { useState } from 'react'
import './App.css'
import SettingsModal from './components/SettingsModal'
import WalletConnect from './components/WalletConnect'
import ChatInterface from './components/ChatInterface'
import VideoPlayer from './components/VideoPlayer'
import { useWallet } from './components/WalletConnect'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [directorRequestSuccessful, setDirectorRequestSuccessful] = useState(false)
  const [streamSettings, setStreamSettings] = useState({
    prompt: 'A serene landscape with mountains and a river at sunset, digital art',
    steps: 28,
    guidance_scale: 4.0,
    reference_images: []
  })

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    const imagePromises = files.slice(0, 10).map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          resolve(`data:${file.type};base64,${btoa(event.target.result)}`)
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(imagePromises).then(images => {
      setStreamSettings(prev => ({
        ...prev,
        reference_images: images
      }))
    })
  }

  const handleSettingsChange = (updater) => {
    setStreamSettings(updater)
  }

  const handleApplySettings = () => {
    setSettingsOpen(false)
    setDirectorOpen(true)
  }

  return (
    <div className="app">

      {/* Main content container with video and chat */}
      <div className="main-content-container">
        {/* Player column: toolbar above the video */}
        <div className="player-column">
          {/* Top Wallet Toolbar */}
          <div className="top-wallet-toolbar">
            <WalletConnect />
          </div>

          {/* Video Player Component */}
          <VideoPlayer 
            onOpenSettings={() => setSettingsOpen(true)}
            directorRequestSuccessful={directorRequestSuccessful}
            onDirectorRequestSuccess={() => setDirectorRequestSuccessful(true)}
            streamSettings={streamSettings}
          />
        </div> {/* end .player-column */}

        {/* Chat Interface - positioned within main container */}
        <ChatInterface />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={streamSettings}
        onSettingsChange={handleSettingsChange}
        onImageUpload={handleImageUpload}
        onApply={handleApplySettings}
      />
    </div>
  )
}

export default App
