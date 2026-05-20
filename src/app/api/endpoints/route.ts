import { NextResponse } from 'next/server'
import {
  CircleApiError,
  createEmailOtpToken,
  createSignMessageChallenge,
  createDeviceToken,
  getTokenBalance,
  initializeUser,
  listWallets,
} from '@/backend/circle/circle.client'

type CircleEndpointAction =
  | 'createDeviceToken'
  | 'createEmailOtpToken'
  | 'initializeUser'
  | 'listWallets'
  | 'getTokenBalance'
  | 'createSignMessageChallenge'

interface CircleEndpointRequest {
  action?: CircleEndpointAction
  deviceId?: string
  email?: string
  userToken?: string
  accountType?: 'EOA' | 'SCA'
  walletId?: string
  message?: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CircleEndpointRequest

    switch (body.action) {
      case 'createDeviceToken': {
        if (!body.deviceId) throw new Error('Missing Circle device id.')
        const device = await createDeviceToken(body.deviceId)
        return NextResponse.json({ action: body.action, ...device })
      }

      case 'createEmailOtpToken': {
        if (!body.email) throw new Error('Missing Circle email.')
        const otp = await createEmailOtpToken({
          email: body.email,
          deviceId: body.deviceId,
        })
        return NextResponse.json({ action: body.action, ...otp })
      }

      case 'initializeUser': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        const initialized = await initializeUser({
          userToken: body.userToken,
          accountType: body.accountType,
        })
        return NextResponse.json({ action: body.action, ...initialized })
      }

      case 'listWallets': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        const wallets = await listWallets(body.userToken)
        return NextResponse.json({ action: body.action, wallets })
      }

      case 'getTokenBalance': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        if (!body.walletId) throw new Error('Missing Circle wallet id.')
        const balances = await getTokenBalance(body.userToken, body.walletId)
        return NextResponse.json({ action: body.action, balances })
      }

      case 'createSignMessageChallenge': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        if (!body.walletId) throw new Error('Missing Circle wallet id.')
        if (!body.message) throw new Error('Missing Circle sign message.')
        const challenge = await createSignMessageChallenge({
          userToken: body.userToken,
          walletId: body.walletId,
          message: body.message,
        })
        return NextResponse.json({ action: body.action, ...challenge })
      }

      default:
        return NextResponse.json(
          { error: { code: 'UNKNOWN_ENDPOINT_ACTION', message: 'Unknown backend endpoint action.' } },
          { status: 400 },
        )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Circle endpoint request failed.'
    if (error instanceof CircleApiError) {
      console.error('[Circle API route] upstream error', {
        action: 'circle-endpoint',
        method: error.method,
        url: error.url,
        status: error.status,
        statusText: error.statusText,
        circleCode: error.circleCode,
        body: error.body,
      })

      return NextResponse.json(
        {
          error: {
            code: 'CIRCLE_UPSTREAM_FAILED',
            message,
            upstream: {
              status: error.status,
              statusText: error.statusText,
              circleCode: error.circleCode,
              url: error.url,
              body: error.body,
            },
          },
        },
        { status: error.status },
      )
    }

    const status = statusFromErrorMessage(message)

    return NextResponse.json(
      {
        error: {
          code: 'CIRCLE_ENDPOINT_FAILED',
          message,
        },
      },
      { status },
    )
  }
}

function statusFromErrorMessage(message: string): number {
  const normalized = message.toLowerCase()
  if (normalized.includes('missing') || normalized.includes('required')) return 400
  if (normalized.includes('expired') || normalized.includes('unauthorized') || normalized.includes('invalid user token')) return 401
  if (normalized.includes('already initialized') || normalized.includes('already existed') || normalized.includes('was initialized')) return 409
  return 502
}
