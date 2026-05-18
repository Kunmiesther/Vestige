import { NextResponse } from 'next/server'
import { initializeUser } from '@/backend/circle/circle.client'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userToken?: string
      accountType?: 'EOA' | 'SCA'
    }
    if (!body.userToken) throw new Error('Missing Circle user token.')
    return NextResponse.json(await initializeUser({
      userToken: body.userToken,
      accountType: body.accountType,
    }))
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'CIRCLE_INITIALIZE_USER_FAILED', message: error instanceof Error ? error.message : 'Failed to initialize Circle user.' } },
      { status: 500 },
    )
  }
}
