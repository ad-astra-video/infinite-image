import React, { useEffect, createContext, useContext, useMemo, useRef } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useContractRead, useSignTypedData } from 'wagmi'
import { Wallet, CheckCircle, AlertTriangle, DollarSign, X } from 'lucide-react'
import { buildX402TypedData } from '../utils/x402'

// Comprehensive Wallet Context - Single source of truth for all wallet data
const WalletContext = createContext({
  // Account data
  address: null,
  isConnected: false,
  chain: null,

  // Balance data
  usdcBalance: '0.00',
  usdcBalanceLoading: false,
  usdcBalanceError: null,

  // Signing functionality
  signX402: async () => {},

  // Connection state
  connected: false,

  // Loading states
  isLoading: false,
})

// Legacy X402Signer context for backward compatibility
const X402SignerContext = createContext({ sign: async () => {}, connected: false })

// New comprehensive Wallet Provider - Centralizes all wallet functionality
export function WalletProvider({ children }) {
  const { address, isConnected, chain } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const accountRef = useRef({ address, isConnected, chain })

    // USDC contract configuration
  const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  const USDC_ABI = [
    {
      "constant": true,
      "inputs": [
        { "name": "account", "type": "address" }
      ],
      "name": "balanceOf",
      "outputs": [
        { "name": "", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]

  // Read USDC balance from contract
  const { data: usdcBalanceWei, isLoading: usdcLoading, isError: usdcError } = useContractRead({
    address: USDC_CONTRACT_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address],
    enabled: isConnected && !!address,
  })

  // Format balance from wei to USD
  const formatUsdcBalance = (balanceWei) => {
    if (!balanceWei) return '0.00'
    try {
      const balance = Number(balanceWei) / 1e6 // USDC has 6 decimals
      return balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    } catch (error) {
      console.error('Error formatting USDC balance:', error)
      return '0.00'
    }
  }

  const usdcBalance = useMemo(() => {
    if (isConnected && address) {
      return formatUsdcBalance(usdcBalanceWei)
    } else {
      return '0.00'
    }
  }, [isConnected, address, usdcBalanceWei])

  // Update account ref whenever account data changes
  useEffect(() => {
    accountRef.current = { address, isConnected, chain }
  }, [address, isConnected, chain])

  // Connection state - trust isConnected as primary indicator
  const connected = !!isConnected

  // X402 signing function with robust account data handling
  const signX402 = useMemo(() => async (paymentRequirements) => {
    console.log('WalletProvider signX402 called:', {
      connected,
      address,
      isConnected,
      hasSignTypedDataAsync: !!signTypedDataAsync
    })

    // Enhanced connection check
    if (!isConnected) {
      console.error('Wallet not connected - isConnected is false')
      throw new Error('Wallet not connected')
    }

    // Ensure we have account data for signing
    let currentAccount = accountRef.current
    if (!currentAccount?.address) {
      console.log('Account data missing, waiting for it to become available...')
      // Wait up to 3 seconds for account data to become available
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100))
        currentAccount = accountRef.current
        if (currentAccount?.address) {
          console.log('Account data became available after waiting')
          break
        }
      }
    }

    // Final check - if we still don't have account data, throw error
    if (!currentAccount?.address) {
      console.error('Account data still missing after waiting - wallet connection failed')
      throw new Error('Wallet account data not available. Please reconnect your wallet.')
    }

    const payReq = paymentRequirements.accepts[0];
    const typedData = buildX402TypedData(payReq, currentAccount.address)
    const signature = await signTypedDataAsync(typedData)

    return { authorization: typedData.message, signature: signature, x402version: paymentRequirements.x402version || 1, x402scheme: payReq.scheme || 'exact', network: payReq.network || 'base-sepolia' }
  }, [isConnected, signTypedDataAsync])

  // Context value - comprehensive wallet state
  const contextValue = useMemo(() => ({
    // Account data
    address,
    isConnected,
    chain,

    // Balance data
    usdcBalance,
    usdcBalanceLoading: usdcLoading,
    usdcBalanceError: usdcError,

    // Signing functionality
    signX402,

    // Connection state
    connected,

    // Loading states
    isLoading: usdcLoading,
  }), [
    address,
    isConnected,
    chain,
    usdcBalance,
    usdcLoading,
    usdcError,
    signX402,
    connected
  ])

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  )
}

// Hook to use the comprehensive wallet context
export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

// Legacy X402SignerProvider for backward compatibility
export function X402SignerProvider({ children }) {
  const wallet = useWallet()

  const legacyContextValue = useMemo(() => ({
    sign: wallet.signX402,
    connected: wallet.connected,
  }), [wallet.signX402, wallet.connected])

  return (
    <X402SignerContext.Provider value={legacyContextValue}>
      {children}
    </X402SignerContext.Provider>
  )
}

// Legacy hook for backward compatibility
export function useX402Signer() {
  const context = useContext(X402SignerContext)
  console.log('useX402Signer called, returning:', {
    connected: context.connected,
    hasSignFunction: typeof context.sign === 'function'
  })
  return context
}

// WalletConnect component - now uses the centralized wallet context
function WalletConnect() {
  const wallet = useWallet()

  const shortenAddress = (addr) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="wallet-connect-container">
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          authenticationStatus,
          mounted,
        }) => {
          const ready = mounted && authenticationStatus !== 'loading'
          const connected = wallet.isConnected && account && chain

          return (
            <div
              className="wallet-connect-layout"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                width: '100%',
                padding: '12px 16px',
              }}
            >
              {/* Left side - Balance display */}
              <div className="wallet-balance-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DollarSign size={18} style={{ color: '#3B82F6' }} />
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  ${wallet.usdcBalanceLoading ? '...' : wallet.usdcBalance}
                </span>
                <div className="error-icon" style={{ position: 'relative' }}>
                  {(wallet.usdcBalanceError || (wallet.isConnected && !wallet.usdcBalance)) && (
                    <AlertTriangle
                      size={16}
                      style={{ color: '#EF4444', cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        e.target.style.color = '#DC2626'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.color = '#EF4444'
                      }}
                    />
                  )}
                  <div className="tooltip" style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    zIndex: 1000,
                    marginTop: '4px',
                    boxShadow: 'var(--shadow)',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.3s ease'
                  }}>
                    {wallet.usdcBalanceError ? 'Unable to read USDC balance' : 'No payments possible, need ETH in wallet on Base chain'}
                  </div>
                </div>
              </div>

              {/* Right side - Wallet controls */}
              <div className="wallet-controls-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {!ready || (ready && !connected) ? (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="wallet-connect-btn-compact"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      background: 'var(--glass-bg)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '12px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'var(--transition)',
                      height: '40px',
                    }}
                    disabled={!mounted || authenticationStatus === 'loading'}
                  >
                    <Wallet size={16} />
                    Connect
                  </button>
                ) : (
                  <>
                    <button
                      onClick={openChainModal}
                      type="button"
                      className="chain-button-compact"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 8px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        height: '36px',
                      }}
                    >
                      {chain.hasIcon && (
                        <img
                          alt={chain.name ?? 'Chain icon'}
                          src={chain.iconUrl}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                          }}
                        />
                      )}
                      {chain.name}
                    </button>

                    <button
                      onClick={openAccountModal}
                      type="button"
                      className="account-button-compact"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: 'var(--glass-bg)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        height: '40px',
                      }}
                    >
                      <CheckCircle size={14} style={{ color: 'var(--accent-primary)' }} />
                      {shortenAddress(account.address)}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        }}
      </ConnectButton.Custom>
    </div>
  )
}

export default WalletConnect
