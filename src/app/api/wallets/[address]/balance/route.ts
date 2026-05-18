import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/wallets/:address/balance
 * Returns USDC balance for an address on Arc testnet.
 * Uses direct JSON-RPC call to Arc node.
 */

const ARC_RPC = process.env.ARC_RPC_URL ?? process.env.RPC?.trim() ??
  'https://rpc.testnet.arc.network'

// USDC contract address on Arc testnet
// https://docs.arc.network/arc/references/contract-addresses
const USDC_CONTRACT = '0x3600000000000000000000000000000000000000'

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

    // The Arc ERC-20 interface uses 6 decimals.
    const raw = BigInt(json.result)
    const divisor = BigInt(1e6)
    const whole = raw / divisor
    const fraction = raw % divisor

    const formatted = fraction === 0n
      ? whole.toString() + '.00'
      : `${whole}.${fraction.toString().padStart(6, '0').slice(0, 2)}`

    return NextResponse.json({ balance: formatted })
  } catch {
    return NextResponse.json({ balance: '0.00' })
  }
}
