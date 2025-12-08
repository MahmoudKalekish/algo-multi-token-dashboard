import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import React, { useState } from 'react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface Props {
  open: boolean
  onClose: () => void
}

const CreateTokenModal: React.FC<Props> = ({ open, onClose }) => {
  const { activeAddress, transactionSigner } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [name, setName] = useState('Dash Token')
  const [unit, setUnit] = useState('DASH')
  const [supply, setSupply] = useState('1000000')
  const [decimals] = useState(0)
  const [loading, setLoading] = useState(false)

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = AlgorandClient.fromConfig({ algodConfig })

  const handleCreate = async () => {
    if (!activeAddress || !transactionSigner) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }

    setLoading(true)

    try {
      enqueueSnackbar('Creating token...', { variant: 'info' })

      const result = await algorand.send.assetCreate({
        sender: activeAddress,
        signer: transactionSigner,

        // ASA parameters
        total: BigInt(supply),
        decimals: decimals,
        unitName: unit,
        assetName: name,
        note: new Uint8Array(Buffer.from('Created with Token Dashboard')),
      })

      const assetId = result.confirmation?.assetIndex
      enqueueSnackbar(`Token created! Asset ID: ${assetId}`, { variant: 'success' })
      
      console.log("Created asset:", assetId)

      onClose()
    } catch (e) {
      console.error(e)
      enqueueSnackbar('Failed to create token', { variant: 'error' })
    }

    setLoading(false)
  }

  return (
    <dialog className={`modal ${open ? 'modal-open' : ''}`}>
      <form method="dialog" className="modal-box">
        <h3 className="font-bold text-lg mb-2">Create Dash Token</h3>

        <div className="form-control mb-2">
          <label className="label">Name</label>
          <input className="input input-bordered" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-control mb-2">
          <label className="label">Unit Name</label>
          <input className="input input-bordered" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>

        <div className="form-control mb-4">
          <label className="label">Total Supply</label>
          <input className="input input-bordered" type="number" value={supply} onChange={(e) => setSupply(e.target.value)} />
        </div>

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>Close</button>

          <button
            type="button"
            className={`btn btn-primary ${loading ? 'btn-disabled' : ''}`}
            onClick={() => void handleCreate()}
          >
            {loading ? <span className="loading loading-spinner" /> : 'Create'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default CreateTokenModal
