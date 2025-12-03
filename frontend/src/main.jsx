import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { WalletProvider } from './components/WalletConnect'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
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
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

let connectors = []
if (projectId) {
  const defaults = getDefaultWallets({
    appName: 'X402 Streaming App',
    chains,
    projectId,
  })
  connectors = defaults.connectors
} else {
  // No projectId provided — warn and fall back to a minimal injected connector
  // so the app mounts and users can still use injected wallets (MetaMask).
  console.warn('VITE_WALLETCONNECT_PROJECT_ID not set — WalletConnect v2 connectors disabled. To enable, set VITE_WALLETCONNECT_PROJECT_ID in your .env')
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
