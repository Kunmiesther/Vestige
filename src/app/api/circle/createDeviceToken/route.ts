import { NextResponse } from 'next/server'
import { createDeviceToken } from '@/backend/circle/circle.client'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { deviceId?: string }
    return NextResponse.json(await createDeviceToken(body.deviceId ?? ''))
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'CIRCLE_DEVICE_TOKEN_FAILED', message: error instanceof Error ? error.message : 'Failed to create device token.' } },
      { status: 500 },
    )
  }
}
