import React, { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useContractRead } from 'wagmi'
import { Wallet, CheckCircle, AlertTriangle, DollarSign, X } from 'lucide-react'

function WalletConnect() {
  const { address, isConnected } = useAccount()
  
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
  
  const [usdcBalance, setUsdcBalance] = useState(null)
  useEffect(() => {
    if (isConnected && address) {
      setUsdcBalance(formatUsdcBalance(usdcBalanceWei))
    }
  }, [isConnected, address, usdcBalanceWei])

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
          const connected = isConnected && account && chain

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
                  ${usdcLoading ? '...' : (usdcBalance || '0.00')}
                </span>
                <div className="error-icon" style={{ position: 'relative' }}>
                  {(usdcError || (isConnected && !usdcBalanceWei)) && (
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
                    {usdcError ? 'Unable to read USDC balance' : 'No payments possible, need ETH in wallet on Base chain'}
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
