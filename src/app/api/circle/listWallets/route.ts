import { NextResponse } from 'next/server'
import { listWallets } from '@/backend/circle/circle.client'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userToken?: string }
    if (!body.userToken) throw new Error('Missing Circle user token.')
    return NextResponse.json({ wallets: await listWallets(body.userToken) })
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'CIRCLE_LIST_WALLETS_FAILED', message: error instanceof Error ? error.message : 'Failed to list Circle wallets.' } },
      { status: 500 },
    )
  }
}
