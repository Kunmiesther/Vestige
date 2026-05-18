/**
 * Vestige wallet integration.
 *
 * Strategy: Circle user-controlled wallets as primary.
 * Injected wallet (MetaMask etc.) as secondary self-custody path.
 *
 * Circle social login gives the user a persistent Arc wallet identity
 * without routing through the disabled legacy provisioning endpoint.
 *
 * The injected wallet path is kept for users who prefer self-custody.
 */

import { ARC_TESTNET, ARC_CHAIN_PARAMS, truncateAddress } from './arc'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletType = 'circle' | 'injected' | null
export type SelfCustodyConnectorId = 'metamask' | 'rabby' | 'coinbase' | 'walletconnect'

export interface SelfCustodyConnector {
  id: SelfCustodyConnectorId
  name: string
  description: string
  available: boolean
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...args: never[]) => void) => void
  removeListener?: (event: string, cb: (...args: never[]) => void) => void
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
}

export interface WalletState {
  address: string | null
  walletType: WalletType
  chainId: number | null
  isConnected: boolean
  isConnecting: boolean
  isOnArc: boolean
  balance: string | null  // USDC balance as formatted string
  error: string | null
}

interface CircleSession {
  userToken: string
  encryptionKey: string
  refreshToken?: string
  userId: string
  wallet?: { id: string; address: string; blockchain: string; state?: string }
  deviceId?: string
  updatedAt?: string
}

export interface WalletActions {
  connectCircle: () => Promise<void>
  connectInjected: (connectorId: SelfCustodyConnectorId) => Promise<void>
  disconnect: () => void
  switchToArc: () => Promise<void>
  refreshBalance: () => Promise<void>
}

// ─── Circle user-controlled wallet helpers ───────────────────────────────

/**
 * Runs Circle social login, executes the user-controlled wallet challenge,
 * lists the resulting Arc wallet, and persists the Circle session locally.
 */
export async function provisionCircleWallet(): Promise<{ address: string; walletId: string }> {
  const restored = loadCircleSession()
  if (restored?.wallet?.address) {
    return { address: restored.wallet.address, walletId: restored.wallet.id }
  }

  if (typeof window === 'undefined') {
    throw new Error('Circle Google login is only available in the browser.')
  }

  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!appId || !googleClientId) {
    throw new Error('Circle Google login is not configured. Set NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID.')
  }

  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  const { SocialLoginProvider, ChallengeStatus } = await import('@circle-fin/w3s-pw-web-sdk/dist/src/types')
  const sdk = new W3SSdk({ appSettings: { appId } })
  const deviceId = await sdk.getDeviceId()
  const deviceRes = await fetch('/api/circle/createDeviceToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })

  if (!deviceRes.ok) throw await walletApiError(deviceRes, 'Failed to create Circle device token')
  const device = await deviceRes.json() as { deviceToken: string; deviceEncryptionKey: string }

  const loginResult = await new Promise<{
    userToken: string
    encryptionKey: string
    refreshToken: string
    oAuthInfo?: { socialUserUUID?: string; socialUserInfo?: { email?: string } }
  }>((resolve, reject) => {
    const configuredSdk = new W3SSdk({
      appSettings: { appId },
      loginConfigs: {
        google: {
          clientId: googleClientId,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        },
        deviceToken: device.deviceToken,
        deviceEncryptionKey: device.deviceEncryptionKey,
      },
    }, (error, result) => {
      if (error || !result) reject(new Error(error?.message ?? 'Circle Google login failed.'))
      else resolve(result)
    })

    configuredSdk.performLogin(SocialLoginProvider.GOOGLE).catch(reject)
  })

  const initRes = await fetch('/api/circle/initializeUser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userToken: loginResult.userToken,
      accountType: 'SCA',
    }),
  })

  if (!initRes.ok) throw await walletApiError(initRes, 'Failed to initialize Circle user wallet')
  const initialized = await initRes.json() as { challengeId: string }

  sdk.setAuthentication({
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
  })

  await new Promise<void>((resolve, reject) => {
    sdk.execute(initialized.challengeId, (error, result) => {
      if (error) {
        reject(new Error(error.message))
        return
      }
      if (result?.status && result.status !== ChallengeStatus.COMPLETE) {
        reject(new Error(`Circle wallet challenge ended with status ${result.status}.`))
        return
      }
      resolve()
    })
  })

  const walletsRes = await fetch('/api/circle/listWallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userToken: loginResult.userToken }),
  })

  if (!walletsRes.ok) throw await walletApiError(walletsRes, 'Failed to list Circle wallets')
  const walletData = await walletsRes.json() as { wallets?: Array<{ id: string; address: string; blockchain: string; state?: string }> }
  const wallet = walletData.wallets?.find(item => item.blockchain === 'ARC-TESTNET') ?? walletData.wallets?.[0]
  if (!wallet?.address) throw new Error('Circle did not return an Arc wallet.')

  const session: CircleSession = {
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
    refreshToken: loginResult.refreshToken,
    userId: loginResult.oAuthInfo?.socialUserUUID ?? loginResult.oAuthInfo?.socialUserInfo?.email ?? wallet.id,
    wallet,
    deviceId,
  }

  persistCircleSession(session)
  return { address: wallet.address, walletId: wallet.id }
}

export async function getPersistedCircleWallet(): Promise<{ address: string; walletId: string } | null> {
  const restored = loadCircleSession()
  return restored?.wallet?.address ? { address: restored.wallet.address, walletId: restored.wallet.id } : null
}

/**
 * GET /api/wallets/:address/balance
 * Returns USDC balance for the wallet address on Arc testnet.
 */
export async function fetchWalletBalance(address: string): Promise<string> {
  const circleSession = loadCircleSession()
  if (circleSession?.wallet?.address?.toLowerCase() === address.toLowerCase()) {
    const res = await fetch('/api/circle/getTokenBalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userToken: circleSession.userToken, walletId: circleSession.wallet.id }),
    }).catch(() => null)
    if (res?.ok) {
      const data = await res.json() as { balances?: Array<{ symbol: string; amount: string }> }
      const usdc = data.balances?.find(balance => balance.symbol === 'USDC')
      if (usdc?.amount) return usdc.amount
    }
  }

  const res = await fetch(`/api/wallets/${address}/balance`)
  if (!res.ok) return '0.00'
  const data = await res.json() as { balance?: string }
  return data.balance ?? '0.00'
}

// ─── Injected wallet (MetaMask / EIP-1193) helpers ───────────────────────────

function getInjectedProviders(): Eip1193Provider[] {
  if (typeof window === 'undefined') return []
  const ethereum = (window as Window & { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } }).ethereum
  if (!ethereum) return []
  return ethereum.providers?.length ? ethereum.providers : [ethereum]
}

function getProvider(connectorId?: SelfCustodyConnectorId): Eip1193Provider | null {
  const providers = getInjectedProviders()
  if (connectorId === 'metamask') return providers.find(provider => provider.isMetaMask && !provider.isRabby) ?? null
  if (connectorId === 'rabby') return providers.find(provider => provider.isRabby) ?? null
  if (connectorId === 'coinbase') return providers.find(provider => provider.isCoinbaseWallet) ?? null
  if (connectorId === 'walletconnect') return null
  return providers[0] ?? null
}

export function listSelfCustodyConnectors(): SelfCustodyConnector[] {
  return [
    { id: 'metamask', name: 'MetaMask', description: 'Injected browser wallet', available: Boolean(getProvider('metamask')) },
    { id: 'rabby', name: 'Rabby', description: 'Injected browser wallet', available: Boolean(getProvider('rabby')) },
    { id: 'coinbase', name: 'Coinbase Wallet', description: 'Injected browser wallet', available: Boolean(getProvider('coinbase')) },
    { id: 'walletconnect', name: 'WalletConnect', description: 'Mobile/session connector', available: false },
  ]
}

export async function requestAccounts(connectorId: SelfCustodyConnectorId): Promise<string[]> {
  const provider = getProvider(connectorId)
  if (!provider) {
    if (connectorId === 'walletconnect') {
      throw new Error('WalletConnect is not configured in this build.')
    }
    throw new Error(`No ${connectorId} provider found.`)
  }
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
  return accounts
}

export async function getChainId(connectorId?: SelfCustodyConnectorId): Promise<number> {
  const provider = getProvider(connectorId)
  if (!provider) return 0
  const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string
  return parseInt(chainIdHex, 16)
}

export async function switchToArcNetwork(connectorId?: SelfCustodyConnectorId): Promise<void> {
  const provider = getProvider(connectorId)
  if (!provider) throw new Error('No injected wallet found.')

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_PARAMS.chainId }],
    })
  } catch (err: unknown) {
    // Chain not added yet — add it
    if ((err as { code?: number })?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_CHAIN_PARAMS],
      })
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_PARAMS.chainId }],
      })
    } else {
      throw err
    }
  }
}

export function onAccountsChanged(callback: (accounts: string[]) => void, connectorId?: SelfCustodyConnectorId): () => void {
  const provider = getProvider(connectorId)
  if (!provider) return () => {}
  const typed = provider as unknown as { on?: (event: string, cb: (accounts: string[]) => void) => void; removeListener?: (event: string, cb: (accounts: string[]) => void) => void }
  typed.on?.('accountsChanged', callback)
  return () => typed.removeListener?.('accountsChanged', callback)
}

export function onChainChanged(callback: (chainId: string) => void, connectorId?: SelfCustodyConnectorId): () => void {
  const provider = getProvider(connectorId)
  if (!provider) return () => {}
  const typed = provider as unknown as { on?: (event: string, cb: (chainId: string) => void) => void; removeListener?: (event: string, cb: (chainId: string) => void) => void }
  typed.on?.('chainChanged', callback)
  return () => typed.removeListener?.('chainChanged', callback)
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'vestige_wallet'
const CIRCLE_SESSION_KEY = 'vestige_circle_user_wallet'

interface PersistedWallet {
  address: string
  walletType: WalletType
}

export function persistWallet(address: string, walletType: WalletType): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ address, walletType }))
  } catch {}
}

export function loadPersistedWallet(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedWallet
  } catch {
    return null
  }
}

export function clearPersistedWallet(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(CIRCLE_SESSION_KEY)
  } catch {}
}

function persistCircleSession(session: CircleSession): void {
  try {
    localStorage.setItem(CIRCLE_SESSION_KEY, JSON.stringify({ ...session, updatedAt: new Date().toISOString() }))
  } catch {}
}

export function loadCircleSession(): CircleSession | null {
  try {
    const raw = localStorage.getItem(CIRCLE_SESSION_KEY)
    return raw ? JSON.parse(raw) as CircleSession : null
  } catch {
    return null
  }
}

async function walletApiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error((body as { error?: { message?: string } }).error?.message ?? fallback)
}

export { ARC_TESTNET, truncateAddress }
