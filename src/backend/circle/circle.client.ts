import { createHash, randomUUID } from 'node:crypto'
import { ARC_TESTNET } from '@/lib/arc'

const DEFAULT_CIRCLE_BASE_URL = 'https://api.circle.com/v1/w3s'

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

function circleConfig() {
  const apiKey = process.env.CIRCLE_API_KEY
  const baseUrl = process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ?? DEFAULT_CIRCLE_BASE_URL
  if (!apiKey) throw new Error('Missing CIRCLE_API_KEY.')
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

async function circleFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey, baseUrl } = circleConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.message ?? body?.error?.message ?? `Circle request failed (${response.status}).`
    throw new Error(message)
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
}): Promise<{ challengeId: string }> {
  const body = await circleFetch<{ data?: { challengeId?: string } }>('/user/initialize', {
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

  const challengeId = body.data?.challengeId
  if (!challengeId) throw new Error('Circle did not return a wallet creation challenge.')
  return { challengeId }
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
  const body = await circleFetch<{ data?: { tokenBalances?: Array<{ token?: { symbol?: string }; amount?: string }> } }>(
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
    token: 'USDC',
    symbol: balance.token?.symbol ?? ARC_TESTNET.currency,
    amount: balance.amount ?? '0.00',
  }))
}

export async function getUserToken(userId: string): Promise<{ userToken: string; encryptionKey: string }> {
  const body = await circleFetch<{ data?: { userToken?: string; encryptionKey?: string } }>('/users/token', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })

  if (!body.data?.userToken || !body.data.encryptionKey) throw new Error('Circle did not return a user token.')
  return { userToken: body.data.userToken, encryptionKey: body.data.encryptionKey }
}
