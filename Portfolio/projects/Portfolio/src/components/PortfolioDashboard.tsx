// src/components/PortfolioDashboard.tsx
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import React, { useEffect, useMemo, useState } from 'react'
import { ellipseAddress } from '../utils/ellipseAddress'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
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
  round: number
  timestamp?: number
}

const PortfolioDashboard: React.FC = () => {
  const { activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [algoBalance, setAlgoBalance] = useState<number | null>(null)
  const [assets, setAssets] = useState<AssetHolding[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [openSendAssetModal, setOpenSendAssetModal] = useState(false)

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
      // 1) Account info for balances
      const acct = await algorand.client.algod.accountInformation(activeAddress).do()

      const algoRaw = typeof acct.amount === 'bigint' ? Number(acct.amount) : acct.amount;
setAlgoBalance(algoRaw / 1e6);
      

      const rawAssets: AssetHolding[] =
        acct.assets?.map((a: any) => ({
          assetId: a['asset-id'],
          amount: a.amount,
        })) ?? []

      // 2) Enrich with asset metadata (name, unit, decimals)
      const enriched = await Promise.all(
        rawAssets.map(async (asset) => {
          try {
            const res = await algorand.client.algod.getAssetByID(asset.assetId).do()
            return {
              ...asset,
              name: res.params.name,
              unitName: res.params['unit-name'],
              decimals: res.params.decimals,
            }
          } catch {
            return asset
          }
        }),
      )

      setAssets(enriched)

      // 3) Recent transactions from indexer
      try {
        const txRes = await algorand.client.indexer
          .searchForTransactions()
          .address(activeAddress)
          .limit(20)
          .do()

        const mapped: Txn[] =
          txRes.transactions?.map((t: any) => ({
            id: t.id,
            type: t['tx-type'],
            assetId: t['asset-transfer-transaction']?.['asset-id'],
amount: t['asset-transfer-transaction']?.amount
  ? Number(t['asset-transfer-transaction']?.amount)
  : t['payment-transaction']?.amount
  ? Number(t['payment-transaction']?.amount)
  : undefined,
            round: t['confirmed-round'],
            timestamp: t['round-time'],
          })) ?? []

        setTxns(mapped)
      } catch (e) {
        console.error(e)
        enqueueSnackbar('Failed to load recent transactions from indexer', { variant: 'warning' })
      }
    } catch (e: any) {
  console.error("ALGOD ERROR:", e);

  if (e?.response?.body) {
    console.error("Algod response error:", await e.response.body.text());
  }

  enqueueSnackbar(`Failed to load portfolio data: ${e?.message ?? e}`, { variant: 'error' });
}
finally {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress])

  if (!activeAddress) {
    return null
  }

  return (
    <div className="mt-8 text-left">
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
            <p className="text-2xl font-bold">{assets.length}</p>
          </div>
        </div>

        <div className="card bg-teal-50 shadow-sm">
          <div className="card-body flex flex-col gap-2">
            <h2 className="card-title text-sm text-gray-500">Token Actions</h2>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setOpenSendAssetModal(true)
              }}
            >
              Send ASA Token
            </button>
          </div>
        </div>
      </div>

      {/* ASSET TABLE */}
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
                    No ASAs found for this account.
                  </td>
                </tr>
              )}
              {assets.map((asset) => {
                const decimals = asset.decimals ?? 0
                const rawAmount = typeof asset.amount === 'bigint' ? Number(asset.amount) : asset.amount;
const displayAmount = decimals
  ? rawAmount / Math.pow(10, decimals)
  : rawAmount;


                return (
                  <tr key={asset.assetId}>
                    <td className="font-mono text-xs">{asset.assetId}</td>
                    <td>{asset.name ?? '—'}</td>
                    <td>{asset.unitName ?? '—'}</td>
                    <td>{displayAmount.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRANSACTION TABLE */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Recent Transactions</h3>
        <div className="overflow-x-auto">
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
                    No recent transactions found.
                  </td>
                </tr>
              )}
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{t.type}</td>
<td>{typeof t.amount === 'number' ? (t.amount / 1e6).toLocaleString() : '—'}</td>
                  <td>{t.assetId ?? '—'}</td>
                  <td>{t.round}</td>
                  <td className="font-mono text-[10px]">
                    {ellipseAddress(t.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SendAssetModal open={openSendAssetModal} onClose={() => setOpenSendAssetModal(false)} />
    </div>
  )
}

export default PortfolioDashboard
