import { NextResponse } from 'next/server'
import {
  CircleApiError,
  createUserWallet,
  createDeviceToken,
  getTokenBalance,
  initializeUser,
  listWallets,
} from '@/backend/circle/circle.client'

type CircleEndpointAction =
  | 'createDeviceToken'
  | 'initializeUser'
  | 'createWallet'
  | 'listWallets'
  | 'getTokenBalance'

interface CircleEndpointRequest {
  action?: CircleEndpointAction
  deviceId?: string
  userToken?: string
  accountType?: 'EOA' | 'SCA'
  walletId?: string
}

export async function POST(request: Request) {
  let action: CircleEndpointAction | undefined
  try {
    const body = await request.json() as CircleEndpointRequest
    action = body.action

    switch (body.action) {
      case 'createDeviceToken': {
        if (!body.deviceId) throw new Error('Missing Circle device id.')
        const device = await createDeviceToken(body.deviceId)
        return NextResponse.json({ action: body.action, ...device })
      }

      case 'initializeUser': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        const initialized = await initializeUser({
          userToken: body.userToken,
          accountType: body.accountType,
        })
        return NextResponse.json({ action: body.action, ...initialized })
      }

      case 'createWallet': {
        if (!body.userToken) throw new Error('Missing Circle user token.')
        const created = await createUserWallet({
          userToken: body.userToken,
          accountType: body.accountType,
        })
        return NextResponse.json({ action: body.action, ...created })
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

      default:
        return NextResponse.json(
          { error: { code: 'UNKNOWN_ENDPOINT_ACTION', message: 'Unknown backend endpoint action.' } },
          { status: 400 },
        )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Circle endpoint request failed.'
    if (error instanceof CircleApiError) {
      const isProduction = process.env.NODE_ENV === 'production'
      const developmentDetails = process.env.NODE_ENV !== 'production'
        ? formatDevelopmentCircleError(error)
        : undefined
      const logDetails = isProduction
        ? {
          action,
          status: error.status,
          statusText: error.statusText,
          circleCode: error.circleCode,
        }
        : {
          action,
          method: error.method,
          url: error.url,
          status: error.status,
          statusText: error.statusText,
          circleCode: error.circleCode,
          body: error.body,
        }
      console.error('[Circle API route] upstream error', logDetails)

      return NextResponse.json(
        {
          error: {
            code: 'CIRCLE_UPSTREAM_FAILED',
            message: developmentDetails ?? message,
            upstream: {
              status: error.status,
              statusText: error.statusText,
              circleCode: error.circleCode,
              ...(isProduction ? {} : { url: error.url, body: error.body }),
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

function formatDevelopmentCircleError(error: CircleApiError): string {
  return [
    error.message,
    `Circle ${error.method} ${error.url}`,
    `Status ${error.status} ${error.statusText}`,
    `Code ${error.circleCode ?? 'unknown'}`,
    JSON.stringify(error.body, null, 2),
  ].filter(Boolean).join('\n')
}
