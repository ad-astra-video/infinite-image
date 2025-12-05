import React from 'react'
import ReactDOM from 'react-dom/client'
import { WalletProvider } from './components/WalletConnect'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.jsx'
import '@rainbow-me/rainbowkit/styles.css'

// Wagmi + RainbowKit setup (Base network only)
import { configureChains, createConfig, WagmiConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InjectedConnector } from 'wagmi/connectors/injected'
import { publicProvider } from 'wagmi/providers/public'
import { base } from 'wagmi/chains'
import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit'

const { chains, publicClient } = configureChains([base], [publicProvider()])

// Read WalletConnect Cloud projectId from env (Vite): VITE_WALLETCONNECT_PROJECT_ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || Math.random().toString(36).substring(7)

let connectors = []
if (projectId) {
  const defaults = getDefaultWallets({
    appName: import.meta.env.VITE_APP_NAME || 'X402-Stream',
    chains,
    projectId,
  })
  connectors = defaults.connectors
} else {
  // No projectId provided — using random string for basic WalletConnect functionality
  console.warn('Using random projectId for WalletConnect v2. For production, set VITE_WALLETCONNECT_PROJECT_ID in your .env')
  connectors = [new InjectedConnector({ chains })]
}

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
})

console.log('Starting X402 app - mounting React root')
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains}>
          <WalletProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  </React.StrictMode>,
)
