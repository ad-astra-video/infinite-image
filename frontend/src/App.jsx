import React, { useState } from 'react'
import './App.css'
import SettingsModal from './components/SettingsModal'
import WalletConnect from './components/WalletConnect'
import ChatInterface from './components/ChatInterface'
import VideoPlayer from './components/VideoPlayer'
import AdminPanel from './components/AdminPanel'
import { ToastProvider } from './components/ToastProvider'
import { useWallet } from './components/WalletConnect'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [streamData, setStreamData] = useState(null)
  const [streamSettings, setStreamSettings] = useState({
    prompt: 'abstract watercolor sunset',
    steps: 28,
    guidance_scale: 4.0,
    reference_images: []
  })

  // Listen for admin panel toggle events
  React.useEffect(() => {
    const handleAdminPanelToggle = () => {
      setAdminPanelOpen(prev => {
        const newState = !prev;
        // Close settings when admin panel opens
        if (newState) {
          setSettingsOpen(false);
        }
        return newState;
      });
    };

    window.addEventListener('toggleAdminPanel', handleAdminPanelToggle);
    return () => window.removeEventListener('toggleAdminPanel', handleAdminPanelToggle);
  }, []);

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

  const handleStreamUpdate = (data) => {
    setStreamData(data)
  }

  const handleApplySettings = () => {
    setSettingsOpen(false)
  }

  return (
    <ToastProvider>
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
            streamSettings={streamSettings}
            streamData={streamData}
            onStreamUpdate={handleStreamUpdate}
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

      {/* Admin Panel - rendered at App level to sit above all elements */}
      <AdminPanel
        isOpen={adminPanelOpen}
        onStreamUpdate={handleStreamUpdate}
        onAdminButtonClick={(show) => {
          setAdminPanelOpen(show);
          // Close settings when admin panel opens
          if (show) {
            setSettingsOpen(false);
          }
        }}
      />
      </div>
    </ToastProvider>
  )
}

export default App
