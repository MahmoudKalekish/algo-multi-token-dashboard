// src/components/PortfolioDashboard.tsx
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import React, { useEffect, useMemo, useState } from 'react'
import { ellipseAddress } from '../utils/ellipseAddress'
import {
  getAlgodConfigFromViteEnvironment,
  getIndexerConfigFromViteEnvironment,
} from '../utils/network/getAlgoClientConfigs'
import CreateTokenModal from './CreateTokenModal'
import SendAssetModal from './SendAssetModal'

interface AssetHolding {
  assetId: number
  amount: number
  decimals?: number
  name?: string
  unitName?: string
}

interface Txn {
  id: string
  type: string
  assetId?: number
  amount?: number
  decimals?: number
  round: number
  timestamp?: number
}

interface Props {
  onOpenCreateModal?: () => void
}

const PortfolioDashboard: React.FC<Props> = ({ onOpenCreateModal }) => {
  const { activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [algoBalance, setAlgoBalance] = useState<number | null>(null)
  const [assets, setAssets] = useState<AssetHolding[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [openSendAssetModal, setOpenSendAssetModal] = useState(false)
  const [openCreateTokenModalLocal, setOpenCreateTokenModalLocal] = useState(false)

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const indexerConfig = getIndexerConfigFromViteEnvironment()

  const algorand = useMemo(
    () =>
      AlgorandClient.fromConfig({
        algodConfig,
        indexerConfig,
      }),
    [algodConfig, indexerConfig],
  )

  const networkName = useMemo(
    () => (algodConfig.network === '' ? 'localnet' : algodConfig.network.toLowerCase()),
    [algodConfig.network],
  )

  const loadPortfolio = async () => {
    if (!activeAddress) return
    setLoading(true)

    try {
      // ==========================
      // 1) Load account info (ALGO + raw ASA holdings)
      // ==========================
      const acct = await algorand.client.algod.accountInformation(activeAddress).do()

      const algoRaw = typeof acct.amount === 'bigint' ? Number(acct.amount) : acct.amount ?? 0
      setAlgoBalance(algoRaw / 1e6)

      // Debug: inspect raw assets structure returned by algod
      console.debug('account.assets:', acct.assets)

      // Be permissive about the shape of asset entries. Some responses may use
      // different key casing or string IDs — coerce to Number and skip invalid.
      const rawAssets: AssetHolding[] = (acct.assets ?? [])
        .map((a: any) => {
          const assetIdRaw = a['asset-id'] ?? a.assetId ?? a['assetId']
          const assetId = typeof assetIdRaw === 'number' ? assetIdRaw : Number(assetIdRaw)
          if (!Number.isFinite(assetId)) return null

          const amountRaw = a.amount ?? a['amount'] ?? 0
          const amount = typeof amountRaw === 'bigint' ? Number(amountRaw) : Number(amountRaw)

          return {
            assetId,
            amount,
          }
        })
        .filter((x): x is AssetHolding => x != null)

      // ==========================
      // 2) Fetch ASA metadata
      // ==========================
      const enriched: AssetHolding[] = await Promise.all(
        rawAssets.map(async (asset) => {
          try {
            const res = await algorand.client.algod.getAssetByID(asset.assetId).do()
            const params = res.params as Record<string, any>

            // Support multiple possible metadata fields returned by different SDKs
            const name = params.name ?? params['asset-name'] ?? params.assetName ?? 'Unknown'
            const unitName = params['unit-name'] ?? params.unitName ?? params.unit ?? 'N/A'
            const decimals = Number.isFinite(Number(params.decimals)) ? Number(params.decimals) : 0

            return {
              ...asset,
              decimals,
              name,
              unitName,
            }
          } catch (err) {
            console.error('ASA metadata fetch failed for:', asset.assetId, err)
            return {
              ...asset,
              decimals: 0,
              name: 'Unknown',
              unitName: 'N/A',
            }
          }
        }),
      )

      setAssets(enriched)

      // Build a helper map for tx decoding (assetId -> decimals)
      const assetMetaById = new Map<number, AssetHolding>()
      enriched.forEach((a) => {
        assetMetaById.set(a.assetId, a)
      })

      // ==========================
      // 3) Fetch recent transactions
      // ==========================
      try {
        const txRes = await algorand.client.indexer
          .searchForTransactions()
          .address(activeAddress)
          .limit(20)
          .do()

        const mapped: Txn[] =
          txRes.transactions?.map((t: any, index: number) => {
            const txType = t['tx-type']
            let amount: number | bigint = 0
            let decimals = 0
            let assetId: number | undefined = undefined

            if (txType === 'pay') {
              // ALGO payment
              amount = t['payment-transaction']?.amount ?? 0
              decimals = 6
            } else if (txType === 'axfer') {
              // ASA transfer
              assetId = t['asset-transfer-transaction']?.['asset-id']
              amount = t['asset-transfer-transaction']?.amount ?? 0
              const meta = assetMetaById.get(assetId ?? -1)
              if (meta && typeof meta.decimals === 'number') {
                decimals = meta.decimals
              }
            }

            if (typeof amount === 'bigint') amount = Number(amount)

            // Tx ID may not be unique in inner txs; add index/round for React key safety
            const id = t.id ?? `${t.group ?? 'grp'}-${t['confirmed-round']}-${index}`

            return {
              id,
              type: txType,
              assetId,
              amount,
              decimals,
              round: t['confirmed-round'],
              timestamp: t['round-time'],
            }
          }) ?? []

        setTxns(mapped)
      } catch (e) {
        console.error(e)
        enqueueSnackbar('Failed to load recent transactions from indexer', {
          variant: 'warning',
        })
      }
    } catch (e: any) {
      console.error('ALGOD ERROR:', e)
      enqueueSnackbar(`Failed to load portfolio data: ${e?.message ?? e}`, {
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeAddress) {
      void loadPortfolio()
    } else {
      setAlgoBalance(null)
      setAssets([])
      setTxns([])
    }
  }, [activeAddress])

  if (!activeAddress) return null

  const validAssetsCount = useMemo(
    () => assets.filter((a) => Number.isFinite(a.assetId) && (a.amount ?? 0) > 0).length,
    [assets],
  )

  const formatTxnAmount = (t: Txn) => {
    if (t.amount == null) return '—'
    const dec = t.decimals ?? 0
    return (t.amount / Math.pow(10, dec)).toLocaleString()
  }

  return (
    <div className="mt-8 text-left">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-sm text-gray-500">Connected</div>
          <a
            className="font-mono font-semibold"
            target="_blank"
            rel="noreferrer"
            href={`https://lora.algokit.io/${networkName}/account/${activeAddress}/`}
          >
            {ellipseAddress(activeAddress)}
          </a>
          <div className="text-xs text-gray-400 mt-1">Network: {networkName}</div>
        </div>

        <button
          className={`btn btn-sm btn-outline ${loading ? 'btn-disabled' : ''}`}
          onClick={() => void loadPortfolio()}
        >
          {loading ? <span className="loading loading-spinner loading-xs" /> : 'Refresh'}
        </button>
      </div>

      {/* BALANCE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card bg-teal-50 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-sm text-gray-500">ALGO Balance</h2>
            <p className="text-2xl font-bold">{algoBalance?.toLocaleString() ?? '—'} ALGO</p>
          </div>
        </div>

        <div className="card bg-teal-50 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-sm text-gray-500">Number of Assets</h2>
            <p className="text-2xl font-bold">{validAssetsCount}</p>
          </div>
        </div>

        <div className="card bg-teal-50 shadow-sm">
          <div className="card-body flex flex-col gap-2">
            <h2 className="card-title text-sm text-gray-500">Token Actions</h2>
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setOpenSendAssetModal(true)}
              >
                Send ASA Token
              </button>

              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  if (onOpenCreateModal) onOpenCreateModal()
                  else setOpenCreateTokenModalLocal(true)
                }}
              >
                Create Token
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ASA TABLE */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Assets in Wallet</h3>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Name</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400">
                    No ASAs found.
                  </td>
                </tr>
              )}

              {assets.map((asset, index) => {
                const dec = asset.decimals ?? 0
                const amount =
                  dec > 0 ? asset.amount / Math.pow(10, dec) : asset.amount

                return (
                  <tr key={asset.assetId ?? index}>
                    <td>{asset.assetId}</td>
                    <td>{asset.name}</td>
                    <td>{asset.unitName}</td>
                    <td>{amount.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRANSACTION TABLE */}
      <h3 className="text-lg font-semibold mb-2">Recent Transactions</h3>
      <div className="overflow-x-auto mb-10">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Asset</th>
              <th>Round</th>
              <th>Tx ID</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400">
                  No transactions found.
                </td>
              </tr>
            )}

            {txns.map((t, index) => (
              <tr key={`${t.id}-${t.round}-${index}`}>
                <td>{t.type}</td>
                <td>{formatTxnAmount(t)}</td>
                <td>{t.assetId ?? 'ALGO'}</td>
                <td>{t.round}</td>
                <td className="font-mono text-[10px]">{ellipseAddress(t.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SEND ASA MODAL */}
      <SendAssetModal
        open={openSendAssetModal}
        onClose={() => setOpenSendAssetModal(false)}
      />

      {/* Local fallback modal for creating tokens if parent doesn't render one */}
      <CreateTokenModal
        open={openCreateTokenModalLocal}
        onClose={() => setOpenCreateTokenModalLocal(false)}
      />
    </div>
  )
}

export default PortfolioDashboard
