import { NextResponse } from 'next/server'
import { getTokenBalance } from '@/backend/circle/circle.client'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userToken?: string; walletId?: string }
    if (!body.userToken) throw new Error('Missing Circle user token.')
    if (!body.walletId) throw new Error('Missing Circle wallet id.')
    return NextResponse.json({ balances: await getTokenBalance(body.userToken, body.walletId) })
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'CIRCLE_BALANCE_FAILED', message: error instanceof Error ? error.message : 'Failed to retrieve Circle balance.' } },
      { status: 500 },
    )
  }
}
