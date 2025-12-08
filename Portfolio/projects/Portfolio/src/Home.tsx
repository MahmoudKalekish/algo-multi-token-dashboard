  // src/Home.tsx
  import { useWallet } from '@txnlab/use-wallet-react'
  import React, { useState } from 'react'
  import ConnectWallet from './components/ConnectWallet'
  import PortfolioDashboard from './components/PortfolioDashboard'
  import Transact from './components/Transact'

  interface HomeProps {}

  const Home: React.FC<HomeProps> = () => {
    const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
    const [openDemoModal, setOpenDemoModal] = useState<boolean>(false)
    const { activeAddress } = useWallet()

    const toggleWalletModal = () => {
      setOpenWalletModal(!openWalletModal)
    }

    const toggleDemoModal = () => {
      setOpenDemoModal(!openDemoModal)
    }

    return (
      <div className="hero min-h-screen bg-teal-400">
        <div className="hero-content text-center rounded-lg p-6 max-w-3xl bg-white mx-auto flex flex-col items-stretch">
          <div className="max-w-xl mx-auto">
            <h1 className="text-4xl">
              Multi-Token <span className="font-bold">Portfolio Dashboard</span>
            </h1>
            <p className="py-6">
              Connect your Algorand wallet, view your ALGO & ASA balances, explore recent transactions, and manage your tokens.
            </p>

            <div className="grid">
              <button data-test-id="connect-wallet" className="btn m-2" onClick={toggleWalletModal}>
                {activeAddress ? 'Wallet Connected' : 'Connect Wallet'}
              </button>

              {activeAddress && (
                <button data-test-id="transactions-demo" className="btn m-2" onClick={toggleDemoModal}>
                  Send 1 ALGO (Demo)
                </button>
              )}
            </div>
          </div>

          {/* Portfolio dashboard */}
          {activeAddress && <PortfolioDashboard />}

          {/* Modals */}
          <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
          <Transact openModal={openDemoModal} setModalState={setOpenDemoModal} />
        </div>
      </div>
    )
  }

  export default Home
