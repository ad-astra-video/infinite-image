import React from 'react'
import ReactDOM from 'react-dom/client'

import { WagmiConfig, http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { metaMaskDeeplinkWallet } from './metaMaskDeeplinkWallet'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import { WalletProvider } from './components/WalletConnect'
import ErrorBoundary from './components/ErrorBoundary'

import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

// Create connectors WITHOUT WalletConnect
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: (() => {
        const isMobile = typeof window !== 'undefined' && /Mobi|Android|iPhone/.test(navigator.userAgent);
        const baseWallets = [
          metaMaskWallet,
          coinbaseWallet,
        ];
        if (isMobile) {
          baseWallets.push(metaMaskDeeplinkWallet);
        } else {
          baseWallets.push(injectedWallet);
        }
        return baseWallets;
      })(),
    },
  ],
  {
    appName: 'infinite-stream',
    projectId: 'dummy-project-id', // RainbowKit still needs this field, but won't use it without WC
  }
)

// Create Wagmi config
const wagmiConfig = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: http()
  },
  ssr: false,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={[base]}>
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