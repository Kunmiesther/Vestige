import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/wallets/:address/balance
 * Returns USDC balance for an address on Arc testnet.
 * Uses direct JSON-RPC call to Arc node.
 */

const ARC_RPC = process.env.ARC_RPC_URL ??
  'https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_f7116dee1c18b0cfbff8c4a4936644a4aa1ecd37b9f8c7856da9fcc7a746aed2'

// USDC contract address on Arc testnet
// https://docs.arc.io/arc/references/contract-addresses
const USDC_CONTRACT = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'

// ERC-20 balanceOf(address) function selector
const BALANCE_OF_SELECTOR = '0x70a08231'

function padAddress(address: string): string {
  return address.replace('0x', '').padStart(64, '0')
}

interface RpcResponse {
  result?: string
  error?: { message: string }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ balance: '0.00' })
  }

  try {
    const data = BALANCE_OF_SELECTOR + padAddress(address)

    const res = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: USDC_CONTRACT, data }, 'latest'],
        id: 1,
      }),
      next: { revalidate: 30 }, // cache 30s
    })

    if (!res.ok) {
      return NextResponse.json({ balance: '0.00' })
    }

    const json = await res.json() as RpcResponse

    if (json.error || !json.result || json.result === '0x') {
      return NextResponse.json({ balance: '0.00' })
    }

    // USDC has 6 decimals on most chains but 18 on Arc (native gas token)
    const raw = BigInt(json.result)
    const divisor = BigInt(1e18)
    const whole = raw / divisor
    const fraction = raw % divisor

    const formatted = fraction === 0n
      ? whole.toString() + '.00'
      : `${whole}.${fraction.toString().padStart(18, '0').slice(0, 2)}`

    return NextResponse.json({ balance: formatted })
  } catch {
    return NextResponse.json({ balance: '0.00' })
  }
}
