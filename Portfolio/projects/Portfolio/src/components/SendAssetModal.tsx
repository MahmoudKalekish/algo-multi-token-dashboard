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
      // Optional pre-check: ensure the receiver has opted-in to this ASA
      try {
        const recvAcct = await algorand.client.algod.accountInformation(receiver).do()
        const recvAssets = recvAcct.assets ?? []
        const hasOptIn = recvAssets.some((a: any) => {
          const idRaw = a['asset-id'] ?? a.assetId ?? a['assetId']
          const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
          return Number(id) === Number(assetId)
        })

        if (!hasOptIn) {
          enqueueSnackbar('Receiver must opt-in to receive this asset.', { variant: 'warning' })
          setLoading(false)
          return
        }
      } catch (e) {
        // Couldn't verify; show a helpful warning and abort to avoid failed tx
        enqueueSnackbar('Unable to verify receiver opt-in status. Aborting send.', { variant: 'warning' })
        setLoading(false)
        return
      }

      enqueueSnackbar('Sending ASA transfer...', { variant: 'info' })

      let result: any = null
      let attempt = 0
      while (attempt < 2) {
        try {
          result = await algorand.send.assetTransfer({
            sender: activeAddress,
            receiver,
            assetId: BigInt(Number(assetId)),
            amount: BigInt(amount), // amount in base units
            signer: transactionSigner,
          })

          // success
          enqueueSnackbar(`Asset transfer sent: ${result.txIds?.[0] ?? 'sent'}`, {
            variant: 'success',
          })
          break
        } catch (err: any) {
          const em = String(err)
          // If txn dead (stale rounds), retry once after a short delay
          if (em.toLowerCase().includes('txn dead') && attempt === 0) {
            enqueueSnackbar('Stale tx params detected, retrying...', { variant: 'info' })
            // wait a bit for algod to advance rounds / for fresh params
            await new Promise((r) => setTimeout(r, 1100))
            attempt += 1
            continue
          }

          // rethrow the error to be handled by outer catch
          throw err
        }
      }
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
