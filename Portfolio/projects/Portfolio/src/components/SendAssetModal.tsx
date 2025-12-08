// src/components/SendAssetModal.tsx
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import React, { useState } from 'react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface Props {
  open: boolean
  onClose: () => void
}

const SendAssetModal: React.FC<Props> = ({ open, onClose }) => {
  const { activeAddress, transactionSigner } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [assetId, setAssetId] = useState('')
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = AlgorandClient.fromConfig({ algodConfig })

  const handleSend = async () => {
    if (!activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect your wallet first', { variant: 'warning' })
      return
    }

    if (!assetId || !receiver || !amount) {
      enqueueSnackbar('Please fill in all fields', { variant: 'warning' })
      return
    }

    if (Number(amount) <= 0) {
      enqueueSnackbar('Amount must be greater than zero', { variant: 'warning' })
      return
    }

    setLoading(true)
    try {
      enqueueSnackbar('Sending ASA transfer...', { variant: 'info' })

      const result = await algorand.send.assetTransfer({
        sender: activeAddress,
        receiver,
        assetId: Number(assetId),
        amount: BigInt(amount), // amount in base units
        signer: transactionSigner,
      })

      enqueueSnackbar(`Asset transfer sent: ${result.txIds[0]}`, {
        variant: 'success',
      })
      setAssetId('')
      setReceiver('')
      setAmount('')
      onClose()
    } catch (e: any) {
      console.error(e)
      const msg = String(e)

      if (msg.includes('must optin')) {
        enqueueSnackbar(
          'Receiver must opt-in to this ASA in their wallet before they can receive it.',
          { variant: 'warning' },
        )
      } else {
        enqueueSnackbar('Failed to send asset transfer', { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog className={`modal ${open ? 'modal-open' : ''}`}>
      <form method="dialog" className="modal-box">
        <h3 className="font-bold text-lg mb-2">Send ASA Token</h3>

        <div className="form-control mb-2">
          <label className="label">
            <span className="label-text">Asset ID</span>
          </label>
          <input
            type="number"
            className="input input-bordered w-full"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder="e.g. 123456"
          />
        </div>

        <div className="form-control mb-2">
          <label className="label">
            <span className="label-text">Receiver Address</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="Wallet address"
          />
        </div>

        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Amount (base units)</span>
          </label>
          <input
            type="number"
            className="input input-bordered w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1000"
          />
        </div>

        <div className="modal-action">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!loading) onClose()
            }}
          >
            Close
          </button>
          <button
            type="button"
            className={`btn btn-primary ${loading ? 'btn-disabled' : ''}`}
            onClick={() => void handleSend()}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Send'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default SendAssetModal
