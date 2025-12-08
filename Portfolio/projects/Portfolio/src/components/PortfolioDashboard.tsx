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
  round?: number
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
            // tolerant parsing of indexer transaction fields
            const txTypeRaw = (t['tx-type'] ?? t.type ?? t['transaction-type'] ?? '').toString().toLowerCase()

            // Normalize to friendly types for UI
            let txType = 'Unknown'
            if (txTypeRaw.includes('pay') || txTypeRaw.includes('payment')) txType = 'ALGO'
            else if (txTypeRaw.includes('axfer') || txTypeRaw.includes('asset')) txType = 'ASA'
            else if (txTypeRaw) txType = txTypeRaw.toUpperCase()

            let amount: number | bigint = 0
            let decimals = 0
            let assetId: number | undefined = undefined

            // try to extract common payment/asset-transfer shapes
            const pay = t['payment-transaction'] ?? t.payment ?? null
            const axfer = t['asset-transfer-transaction'] ?? t['asset-transfer'] ?? t.asset_transfer_transaction ?? null

            if (txType === 'pay' || pay) {
              // ALGO payment
              amount = (pay?.amount ?? t.amount ?? 0)
              decimals = 6
            } else if (txType === 'axfer' || axfer) {
              // ASA transfer
              assetId = (axfer?.['asset-id'] ?? axfer?.['assetId'] ?? axfer?.assetId)
              amount = axfer?.amount ?? t.amount ?? 0
              const meta = assetMetaById.get(Number(assetId ?? -1))
              if (meta && typeof meta.decimals === 'number') {
                decimals = meta.decimals
              }
            }

            if (typeof amount === 'bigint') amount = Number(amount)
            if (typeof amount === 'string') amount = Number(amount)

            // Tx ID may not be unique in inner txs; add index/round for React key safety
            const id = t.id ?? t.txid ?? `${t.group ?? 'grp'}-${t['confirmed-round'] ?? t.round ?? 0}-${index}`

            const roundRaw = t['confirmed-round'] ?? t.confirmedRound ?? t.round
            const round = Number.isFinite(Number(roundRaw)) ? Number(roundRaw) : undefined

            return {
              id,
              type: txType,
              assetId: assetId ? Number(assetId) : undefined,
              amount: typeof amount === 'number' ? amount : Number(amount),
              decimals,
              round,
              timestamp: t['round-time'] ?? t.roundTime ?? t['round-time'],
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

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(activeAddress ?? '')
      enqueueSnackbar('Address copied to clipboard', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar('Failed to copy address', { variant: 'warning' })
    }
  }

  const formatTxnAmount = (t: Txn) => {
    if (t.amount == null) return '—'
    const dec = t.decimals ?? 0
    return (t.amount / Math.pow(10, dec)).toLocaleString()
  }

  const formatAssetAmount = (asset: AssetHolding) => {
    const dec = asset.decimals ?? 0
    const amount = dec > 0 ? asset.amount / Math.pow(10, dec) : asset.amount
    return amount.toLocaleString(undefined, { maximumFractionDigits: Math.max(0, dec) })
  }

  return (
    <div className="mt-8 text-left">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-300 to-teal-600 flex items-center justify-center text-white font-bold">
            {ellipseAddress(activeAddress).slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <span>Connected</span>
              <span className="text-xs badge badge-ghost">{networkName}</span>
            </div>

            <div className="flex items-center gap-2">
              <a
                className="font-mono font-semibold text-sm"
                target="_blank"
                rel="noreferrer"
                href={`https://lora.algokit.io/${networkName}/account/${activeAddress}/`}
              >
                {ellipseAddress(activeAddress)}
              </a>
              <button className="btn btn-ghost btn-xs" onClick={copyAddress} title="Copy address">
                Copy
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1">Network: {networkName}</div>
          </div>
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
          <div className="card-body flex flex-col gap-2 overflow-hidden">
            <h2 className="card-title text-sm text-gray-500">Token Actions</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
        <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
          <span>Assets in Wallet</span>
          <span className="text-sm text-gray-500">{validAssetsCount} assets</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="hidden md:table-cell">Asset ID</th>
                <th className="hidden sm:table-cell">Unit</th>
                <th className="text-right">Amount</th>
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
                return (
                  <tr key={asset.assetId ?? index}>
                    <td className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700">{(asset.unitName ?? 'T').slice(0,3)}</div>
                      <div>
                        <div className="font-semibold">{asset.name}</div>
                        <div className="text-xs text-gray-400">{asset.unitName}</div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">{asset.assetId}</td>
                    <td className="hidden sm:table-cell">{asset.unitName}</td>
                    <td className="text-right font-mono">{formatAssetAmount(asset)}</td>
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
              <tr key={`${t.id}-${t.round ?? 'r'}-${index}`}>
                <td className="capitalize">{t.type ?? 'Unknown'}</td>
                <td>{formatTxnAmount(t)}</td>
                <td>{t.assetId ?? 'ALGO'}</td>
                <td>{t.round ?? '—'}</td>
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
