import { randomUUID } from 'node:crypto'
import { ARC_TESTNET } from '@/lib/arc'

const DEFAULT_CIRCLE_BASE_URL = 'https://api.circle.com/v1/w3s'
const USER_ALREADY_INITIALIZED_CODE = 155106

export interface CircleWalletSession {
  userToken: string
  encryptionKey: string
  refreshToken?: string
  userId: string
  wallet?: CircleWallet
  deviceId?: string
}

export interface CircleWallet {
  id: string
  address: string
  blockchain: string
  state?: string
}

export interface CircleTokenBalance {
  token: string
  symbol: string
  amount: string
}

export class CircleApiError extends Error {
  status: number
  statusText: string
  circleCode?: number | string
  body: unknown
  url: string
  method: string

  constructor(input: {
    message: string
    status: number
    statusText: string
    circleCode?: number | string
    body: unknown
    url: string
    method: string
  }) {
    super(input.message)
    this.name = 'CircleApiError'
    this.status = input.status
    this.statusText = input.statusText
    this.circleCode = input.circleCode
    this.body = input.body
    this.url = input.url
    this.method = input.method
  }
}

function circleConfig() {
  const apiKey = process.env.CIRCLE_API_KEY
  const baseUrl = normalizeCircleBaseUrl(process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ?? DEFAULT_CIRCLE_BASE_URL)
  if (!apiKey) throw new Error('Missing CIRCLE_API_KEY.')
  return { apiKey, baseUrl }
}

async function circleFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey, baseUrl } = circleConfig()
  const url = `${baseUrl}${path}`
  const method = init?.method ?? 'GET'

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = await parseResponseBody(response)

  if (!response.ok) {
    const message = circleErrorMessage(body, response.status)
    throw new CircleApiError({
      message,
      status: response.status,
      statusText: response.statusText,
      circleCode: circleErrorCode(body),
      body,
      url,
      method,
    })
  }
  return body as T
}

export async function createDeviceToken(deviceId: string): Promise<{ deviceToken: string; deviceEncryptionKey: string }> {
  if (!deviceId) throw new Error('deviceId is required.')
  const body = await circleFetch<{ data?: { deviceToken?: string; deviceEncryptionKey?: string } }>('/users/social/token', {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: randomUUID(), deviceId }),
  })

  return {
    deviceToken: body.data?.deviceToken ?? '',
    deviceEncryptionKey: body.data?.deviceEncryptionKey ?? '',
  }
}

export async function initializeUser(input: {
  userToken: string
  accountType?: 'EOA' | 'SCA'
}): Promise<{ challengeId?: string; alreadyInitialized?: boolean }> {
  let body: { data?: { challengeId?: string } }
  try {
    body = await circleFetch<{ data?: { challengeId?: string } }>('/user/initialize', {
      method: 'POST',
      headers: {
        'X-User-Token': input.userToken,
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        accountType: input.accountType ?? 'SCA',
        blockchains: ['ARC-TESTNET'],
      }),
    })
  } catch (error) {
    if (isUserAlreadyInitializedError(error)) {
      return { alreadyInitialized: true }
    }
    throw error
  }

  const challengeId = body.data?.challengeId
  if (!challengeId) throw new Error('Circle did not return a wallet initialization challenge.')
  return { challengeId, alreadyInitialized: false }
}

export async function listWallets(userToken: string): Promise<CircleWallet[]> {
  const body = await circleFetch<{ data?: { wallets?: Array<{ id?: string; address?: string; blockchain?: string; state?: string }> } }>('/wallets?blockchain=ARC-TESTNET', {
    method: 'GET',
    headers: {
      'X-User-Token': userToken,
    },
  })

  return (body.data?.wallets ?? [])
    .filter((wallet): wallet is { id: string; address: string; blockchain?: string; state?: string } => Boolean(wallet.id && wallet.address))
    .map((wallet) => ({
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? 'ARC-TESTNET',
      state: wallet.state,
    }))
}

export async function getTokenBalance(userToken: string, walletId: string): Promise<CircleTokenBalance[]> {
  const body = await circleFetch<{ data?: { tokenBalances?: Array<{ token?: { id?: string; symbol?: string }; amount?: string }> } }>(
    `/wallets/${walletId}/balances`,
    {
      method: 'GET',
      headers: {
        'X-User-Token': userToken,
      },
    },
  )

  const balances = body.data?.tokenBalances ?? []
  return balances.map((balance) => ({
    token: balance.token?.id ?? balance.token?.symbol ?? ARC_TESTNET.currency,
    symbol: balance.token?.symbol ?? ARC_TESTNET.currency,
    amount: balance.amount ?? '0.00',
  }))
}

export async function createSignMessageChallenge(input: {
  userToken: string
  walletId: string
  message: string
}): Promise<{ challengeId: string }> {
  if (!input.userToken) throw new Error('userToken is required.')
  if (!input.walletId) throw new Error('walletId is required.')
  if (!input.message) throw new Error('message is required.')

  const body = await circleFetch<{ data?: { challengeId?: string } }>('/user/sign/message', {
    method: 'POST',
    headers: {
      'X-User-Token': input.userToken,
    },
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      walletId: input.walletId,
      message: input.message,
    }),
  })

  const challengeId = body.data?.challengeId
  if (!challengeId) throw new Error('Circle did not return a sign-message challenge.')
  return { challengeId }
}

export async function getUserToken(userId: string): Promise<{ userToken: string; encryptionKey: string }> {
  const body = await circleFetch<{ data?: { userToken?: string; encryptionKey?: string } }>('/users/token', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })

  if (!body.data?.userToken || !body.data.encryptionKey) throw new Error('Circle did not return a user token.')
  return { userToken: body.data.userToken, encryptionKey: body.data.encryptionKey }
}

function circleErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const message = body.message
    if (typeof message === 'string') return message

    const error = body.error
    if (isRecord(error)) {
      if (typeof error.message === 'string') return error.message
      if (typeof error.code === 'string') return error.code
    }
    if (typeof body.code === 'string') return body.code
  }

  return `Circle request failed (${status}).`
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return {}

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function normalizeCircleBaseUrl(value: string): string {
  const trimmed = value.replace(/\/$/, '')
  if (trimmed.endsWith('/v1/w3s')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/w3s`
  return `${trimmed}/v1/w3s`
}

function isUserAlreadyInitializedError(error: unknown): boolean {
  const circleCode = (error as { circleCode?: number | string })?.circleCode
  if (String(circleCode) === String(USER_ALREADY_INITIALIZED_CODE)) return true

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('already') && message.includes('initialized')
}

function circleErrorCode(body: unknown): number | string | undefined {
  if (!isRecord(body)) return undefined
  const topLevelCode = body.code
  if (typeof topLevelCode === 'number' || typeof topLevelCode === 'string') return topLevelCode

  const error = body.error
  if (isRecord(error)) {
    const code = error.code
    if (typeof code === 'number' || typeof code === 'string') return code
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}
