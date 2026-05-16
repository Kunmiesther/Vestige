import { NextResponse } from 'next/server'

/**
 * POST /api/wallets/provision
 *
 * Creates or retrieves a Circle developer-controlled wallet for the session.
 * Uses Circle's Wallets API with Arc Testnet (ARC-TESTNET blockchain).
 *
 * Circle developer-controlled wallets docs:
 * https://developers.circle.com/w3s/developer-controlled-wallets
 */

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? ''
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET ?? ''
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID ?? ''
const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s'

interface CircleWalletResponse {
  data?: {
    wallets?: Array<{
      id: string
      address: string
      state: string
      blockchain: string
    }>
  }
}

interface CircleCreateWalletResponse {
  data?: {
    wallets?: Array<{
      id: string
      address: string
    }>
  }
}

export async function POST(): Promise<NextResponse> {
  if (!CIRCLE_API_KEY) {
    // Fallback: return a stub address for development without Circle credentials
    const stubAddress = '0x' + Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
    return NextResponse.json({
      address: stubAddress,
      walletId: 'stub-' + Date.now(),
      note: 'Stub wallet — set CIRCLE_API_KEY for real Circle wallets',
    })
  }

  try {
    // 1. Try to list existing wallets first (idempotent)
    const listRes = await fetch(
      `${CIRCLE_API_BASE}/wallets?walletSetId=${CIRCLE_WALLET_SET_ID}&blockchain=ARC-TESTNET&pageSize=1`,
      {
        headers: {
          Authorization: `Bearer ${CIRCLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (listRes.ok) {
      const listData = await listRes.json() as CircleWalletResponse
      const existing = listData.data?.wallets?.[0]
      if (existing?.address) {
        return NextResponse.json({
          address: existing.address,
          walletId: existing.id,
        })
      }
    }

    // 2. Create a new wallet
    const createRes = await fetch(`${CIRCLE_API_BASE}/wallets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Entity-Secret-Ciphertext': CIRCLE_ENTITY_SECRET,
      },
      body: JSON.stringify({
        idempotencyKey: `vestige-${Date.now()}`,
        accountType: 'EOA',
        blockchains: ['ARC-TESTNET'],
        walletSetId: CIRCLE_WALLET_SET_ID,
        count: 1,
      }),
    })

    if (!createRes.ok) {
      const errBody = await createRes.text()
      throw new Error(`Circle wallet creation failed: ${errBody}`)
    }

    const createData = await createRes.json() as CircleCreateWalletResponse
    const wallet = createData.data?.wallets?.[0]

    if (!wallet?.address) {
      throw new Error('No wallet address returned from Circle')
    }

    return NextResponse.json({
      address: wallet.address,
      walletId: wallet.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wallet provisioning failed'
    return NextResponse.json(
      { error: { code: 'WALLET_PROVISION_FAILED', message } },
      { status: 500 }
    )
  }
}
