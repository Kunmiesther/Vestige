import { NextResponse } from 'next/server'

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: {
        code: 'LEGACY_WALLET_PROVISION_DISABLED',
        message: 'Use the Circle user-controlled wallet flow at /api/circle/*.',
      },
    },
    { status: 501 },
  )
}
