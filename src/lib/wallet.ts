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

export interface WalletHolding {
  symbol: string
  amount: string
  source: 'circle' | 'rpc'
}

export interface WalletPortfolioState {
  walletAddress: string
  walletType: Exclude<WalletType, null>
  walletId?: string
  holdings: WalletHolding[]
  watchlist: string[]
  exposure: {
    usdcBalance: number
    trackedAssets: number
    openPositions: number
  }
  updatedAt: string
}

export interface CircleSession {
  userToken: string
  encryptionKey: string
  refreshToken?: string
  userId: string
  wallet?: { id: string; address: string; blockchain: string; state?: string }
  deviceId?: string
  updatedAt?: string
}

interface CirclePendingLogin {
  provider: 'google'
  deviceId: string
  deviceToken: string
  deviceEncryptionKey: string
  redirectUri: string
  returnPath: string
  startedAt: string
}

interface CircleWallet {
  id: string
  address: string
  blockchain: string
  state?: string
}

interface CircleLoginResult {
  userToken: string
  encryptionKey: string
  refreshToken?: string
  oAuthInfo?: {
    socialUserUUID?: string
    socialUserInfo?: { email?: string }
  }
}

interface CircleSdkError {
  code?: number | string
  message?: string
}

interface CircleChallengeResult {
  status?: string
  type?: string
  data?: {
    signature?: string
    txHash?: string
  }
}

interface CircleSdkInstance {
  getDeviceId: () => Promise<string>
  performLogin: (provider: string) => Promise<void>
  setAuthentication: (auth: { userToken: string; encryptionKey: string }) => void
  updateConfigs?: (configs?: CircleSdkConfigs, onLoginComplete?: CircleLoginCallback) => void
  execute: (
    challengeId: string,
    onCompleted?: (error?: CircleSdkError, result?: CircleChallengeResult) => void,
  ) => void
}

interface CircleSdkConfigs {
  appSettings: { appId: string }
  authentication?: { userToken: string; encryptionKey: string }
  loginConfigs?: {
    google?: {
      clientId: string
      redirectUri: string
      selectAccountPrompt?: boolean
    }
    deviceToken: string
    deviceEncryptionKey: string
  }
}

type CircleLoginCallback = (error: CircleSdkError | undefined, result: CircleLoginResult | undefined) => void
type CircleSdkConstructor = new (configs?: CircleSdkConfigs, onLoginComplete?: CircleLoginCallback) => CircleSdkInstance

interface CircleRuntime {
  W3SSdk: CircleSdkConstructor
  SocialLoginProvider: { GOOGLE: string }
  ChallengeStatus: { COMPLETE: string }
}

export interface WalletActions {
  connectCircle: () => Promise<void>
  connectInjected: (connectorId: SelfCustodyConnectorId) => Promise<void>
  disconnect: () => void
  switchToArc: () => Promise<void>
  refreshBalance: () => Promise<void>
}

class CircleWalletOperationError extends Error {
  constructor(message: string, public readonly code?: number | string) {
    super(message)
    this.name = 'CircleWalletOperationError'
  }
}

// ─── Circle user-controlled wallet helpers ───────────────────────────────

/**
 * Runs Circle Google login, executes the user-controlled wallet challenge,
 * lists the resulting Arc wallet, and persists the Circle session locally.
 */
export async function provisionCircleWallet(): Promise<{ address: string; walletId: string }> {
  circleAuthLog('google-connect:requested')

  const restored = await restoreCircleWalletSession()
  if (restored) {
    circleAuthLog('google-connect:restored-existing-session', { address: restored.address })
    return restored
  }

  await startCircleGoogleLogin()

  return new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error('Circle Google login redirect did not complete. Check that the redirect URI matches the Google OAuth configuration.'))
    }, 15000)
  })
}

export async function getPersistedCircleWallet(): Promise<{ address: string; walletId: string } | null> {
  return restoreCircleWalletSession()
}

export async function completePendingCircleLogin(): Promise<{ address: string; walletId: string; returnPath?: string } | null> {
  if (!hasPendingCircleLogin()) return null

  const pending = loadCirclePendingLogin()
  if (!pending) {
    circleAuthLog('redirect:pending-cookie-without-local-storage')
    throw new Error('Circle login recovery data is missing. Start Google login again.')
  }

  circleAuthLog('redirect:recovery-started', {
    redirectUri: pending.redirectUri,
    returnPath: pending.returnPath,
    hasHash: Boolean(window.location.hash),
  })

  const runtime = await loadCircleRuntime()
  const config = circleConfig()
  const { sdk, loginResult } = await waitForSocialLoginResult(runtime, config, pending)
  circleAuthLog('redirect:oauth-verified', {
    hasUserToken: Boolean(loginResult.userToken),
    hasEncryptionKey: Boolean(loginResult.encryptionKey),
  })

  const wallet = await initializeCircleUserWallet(sdk, runtime, loginResult)
  const session: CircleSession = {
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
    refreshToken: loginResult.refreshToken,
    userId: loginResult.oAuthInfo?.socialUserUUID ?? loginResult.oAuthInfo?.socialUserInfo?.email ?? wallet.id,
    wallet,
    deviceId: pending.deviceId,
  }

  persistCircleSession(session)
  clearCirclePendingLogin()
  clearCircleSdkOAuthState()
  circleAuthLog('redirect:wallet-ready', { address: wallet.address, walletId: wallet.id })

  return { address: wallet.address, walletId: wallet.id, returnPath: safeReturnPath(pending.returnPath) }
}

export function hasPendingCircleLoginRecovery(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.location.hash) && hasPendingCircleLogin()
}

/**
 * GET /api/wallets/:address/balance
 * Returns USDC balance for the wallet address on Arc testnet.
 */
export async function fetchWalletBalance(address: string): Promise<string> {
  const circleSession = loadCircleSession()
  if (circleSession?.wallet?.address?.toLowerCase() === address.toLowerCase()) {
    circleAuthLog('balance:circle-fetch-start', { walletId: circleSession.wallet.id })
    const data = await circleEndpoint<{ balances?: Array<{ symbol: string; amount: string }> }>('getTokenBalance', {
      userToken: circleSession.userToken,
      walletId: circleSession.wallet.id,
    }).catch((error) => {
      circleAuthLog('balance:circle-fetch-failed', { message: error instanceof Error ? error.message : 'unknown' })
      return null
    })
    if (data) {
      const usdc = data.balances?.find(balance => balance.symbol === 'USDC')
      if (usdc?.amount) return usdc.amount
    }
  }

  const res = await fetch(`/api/wallets/${address}/balance`)
  if (!res.ok) return '0.00'
  const data = await res.json() as { balance?: string }
  return data.balance ?? '0.00'
}

export async function restoreWalletPortfolioState(): Promise<WalletPortfolioState | null> {
  const persisted = loadPersistedWallet()
  if (!persisted?.address || !persisted.walletType) return null

  const circleSession = loadCircleSession()
  const balance = await fetchWalletBalance(persisted.address).catch(() => '0.00')
  const saved = loadWalletPortfolioState(persisted.address)
  const watchlist = loadWalletWatchlist(persisted.address)
  const holdings: WalletHolding[] = Number.parseFloat(balance) > 0
    ? [{ symbol: 'USDC', amount: balance, source: persisted.walletType === 'circle' ? 'circle' : 'rpc' }]
    : []

  return persistWalletPortfolioState({
    walletAddress: persisted.address,
    walletType: persisted.walletType,
    walletId: persisted.walletType === 'circle' ? circleSession?.wallet?.id : undefined,
    holdings,
    watchlist,
    exposure: {
      usdcBalance: Number.parseFloat(balance) || 0,
      trackedAssets: watchlist.length,
      openPositions: saved?.exposure.openPositions ?? 0,
    },
    updatedAt: new Date().toISOString(),
  })
}

async function startCircleGoogleLogin(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Circle Google login is only available in the browser.')
  }

  const config = circleConfig()
  const runtime = await loadCircleRuntime()
  const bootstrapSdk = new runtime.W3SSdk({ appSettings: { appId: config.appId } })

  circleAuthLog('device-id:start')
  const deviceId = await bootstrapSdk.getDeviceId()
  circleAuthLog('device-id:received')

  circleAuthLog('device-token:create-start')
  const device = await circleEndpoint<{ deviceToken: string; deviceEncryptionKey: string }>('createDeviceToken', { deviceId })
  if (!device.deviceToken || !device.deviceEncryptionKey) {
    throw new Error('Circle did not return a valid device token.')
  }
  circleAuthLog('device-token:create-complete')

  const pending: CirclePendingLogin = {
    provider: 'google',
    deviceId,
    deviceToken: device.deviceToken,
    deviceEncryptionKey: device.deviceEncryptionKey,
    redirectUri: config.redirectUri,
    returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    startedAt: new Date().toISOString(),
  }
  persistCirclePendingLogin(pending)

  configureExistingCircleSdk(bootstrapSdk, config, pending, (error) => {
    if (error) circleAuthLog('login:pre-redirect-callback-error', { code: error.code, message: error.message })
  })

  circleAuthLog('login:redirect-start', {
    redirectUri: config.redirectUri,
    returnPath: pending.returnPath,
  })
  await bootstrapSdk.performLogin(runtime.SocialLoginProvider.GOOGLE)
}

async function restoreCircleWalletSession(): Promise<{ address: string; walletId: string } | null> {
  const restored = loadCircleSession()
  if (!restored?.userToken || !restored.encryptionKey) return null

  if (restored.wallet?.address) {
    circleAuthLog('restore:local-wallet-found', { address: restored.wallet.address, walletId: restored.wallet.id })
    const verified = await listCircleWallets(restored.userToken).catch((error) => {
      circleAuthLog('restore:wallet-verification-failed', { message: error instanceof Error ? error.message : 'unknown' })
      return null
    })

    if (!verified) return { address: restored.wallet.address, walletId: restored.wallet.id }

    const wallet = selectCircleWallet(verified) ?? restored.wallet
    if (wallet?.address) {
      persistCircleSession({ ...restored, wallet })
      circleAuthLog('restore:wallet-verified', { address: wallet.address, walletId: wallet.id })
      return { address: wallet.address, walletId: wallet.id }
    }
  }

  circleAuthLog('restore:token-pair-without-wallet')
  const wallets = await listCircleWallets(restored.userToken).catch((error) => {
    circleAuthLog('restore:list-wallets-failed', { message: error instanceof Error ? error.message : 'unknown' })
    return null
  })
  const wallet = wallets ? selectCircleWallet(wallets) : null
  if (!wallet?.address) return null

  persistCircleSession({ ...restored, wallet })
  return { address: wallet.address, walletId: wallet.id }
}

async function waitForSocialLoginResult(
  runtime: CircleRuntime,
  config: ReturnType<typeof circleConfig>,
  pending: CirclePendingLogin,
): Promise<{ sdk: CircleSdkInstance; loginResult: CircleLoginResult }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Circle OAuth verification timed out after redirect.'))
    }, 30000)

    const sdk = createConfiguredCircleSdk(runtime, config, pending, (error, result) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)

      if (error || !result) {
        reject(new Error(error?.message ?? 'Circle Google login failed after redirect.'))
        return
      }

      if (!result.userToken || !result.encryptionKey) {
        reject(new Error('Circle login did not return a user token and encryption key.'))
        return
      }

      resolve({ sdk, loginResult: result })
    })
  })
}

async function initializeCircleUserWallet(
  sdk: CircleSdkInstance,
  runtime: CircleRuntime,
  loginResult: CircleLoginResult,
): Promise<CircleWallet> {
  circleAuthLog('initialize:start')
  const initialized = await circleEndpoint<{ challengeId?: string; alreadyInitialized?: boolean }>('initializeUser', {
    userToken: loginResult.userToken,
    accountType: 'SCA',
  })

  sdk.setAuthentication({
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
  })
  circleAuthLog('sdk:authentication-set', {
    hasUserToken: Boolean(loginResult.userToken),
    hasEncryptionKey: Boolean(loginResult.encryptionKey),
  })

  if (initialized.challengeId) {
    circleAuthLog('challenge:execute-start')
    await executeCircleChallenge(sdk, runtime, initialized.challengeId)
    circleAuthLog('challenge:execute-complete')
  } else if (initialized.alreadyInitialized) {
    circleAuthLog('initialize:already-initialized')
  } else {
    throw new Error('Circle did not return an initialization challenge or existing-user state.')
  }

  const wallets = await listCircleWalletsWithRetry(loginResult.userToken)
  const wallet = selectCircleWallet(wallets)
  if (!wallet?.address) throw new Error('Circle did not return an Arc wallet for this user.')

  circleAuthLog('wallet:list-complete', {
    walletCount: wallets.length,
    walletId: wallet.id,
    address: wallet.address,
  })
  return wallet
}

function executeCircleChallenge(
  sdk: CircleSdkInstance,
  runtime: CircleRuntime,
  challengeId: string,
): Promise<CircleChallengeResult | undefined> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Circle wallet challenge timed out.'))
    }, 120000)

    sdk.execute(challengeId, (error, result) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)

      if (error) {
        reject(new CircleWalletOperationError(error.message ?? 'Circle wallet challenge failed.', error.code))
        return
      }

      if (result?.status && result.status !== runtime.ChallengeStatus.COMPLETE) {
        reject(new CircleWalletOperationError(`Circle wallet challenge ended with status ${result.status}.`))
        return
      }

      resolve(result)
    })
  })
}

async function listCircleWallets(userToken: string): Promise<CircleWallet[]> {
  circleAuthLog('wallet:list-start')
  const data = await circleEndpoint<{ wallets?: CircleWallet[] }>('listWallets', { userToken })
  return data.wallets ?? []
}

async function listCircleWalletsWithRetry(userToken: string): Promise<CircleWallet[]> {
  let lastWallets: CircleWallet[] = []
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    lastWallets = await listCircleWallets(userToken)
    if (selectCircleWallet(lastWallets)?.address) return lastWallets

    circleAuthLog('wallet:list-empty', { attempt })
    await delay(1000 * attempt)
  }
  return lastWallets
}

function selectCircleWallet(wallets: CircleWallet[]): CircleWallet | null {
  return wallets.find(item => item.blockchain === 'ARC-TESTNET') ?? wallets[0] ?? null
}

function configureExistingCircleSdk(
  sdk: CircleSdkInstance,
  config: ReturnType<typeof circleConfig>,
  pending: CirclePendingLogin,
  onLoginComplete: CircleLoginCallback,
): void {
  const configs = circleSdkConfigs(config, pending)
  if (sdk.updateConfigs) {
    sdk.updateConfigs(configs, onLoginComplete)
    return
  }

  circleAuthLog('sdk:update-configs-unavailable')
}

function createConfiguredCircleSdk(
  runtime: CircleRuntime,
  config: ReturnType<typeof circleConfig>,
  pending: CirclePendingLogin,
  onLoginComplete: CircleLoginCallback,
): CircleSdkInstance {
  const configs = circleSdkConfigs(config, pending)
  const sdk = new runtime.W3SSdk(configs, onLoginComplete)
  sdk.updateConfigs?.(configs, onLoginComplete)
  return sdk
}

function circleSdkConfigs(
  config: ReturnType<typeof circleConfig>,
  pending: CirclePendingLogin,
): CircleSdkConfigs {
  const loginConfigs: CircleSdkConfigs['loginConfigs'] = {
    deviceToken: pending.deviceToken,
    deviceEncryptionKey: pending.deviceEncryptionKey,
  }

  loginConfigs.google = {
    clientId: config.googleClientId,
    redirectUri: pending.redirectUri,
    selectAccountPrompt: true,
  }

  return {
    appSettings: { appId: config.appId },
    loginConfigs,
  }
}

async function loadCircleRuntime(): Promise<CircleRuntime> {
  circleAuthLog('sdk:import-start')
  const sdkModule = await import('@circle-fin/w3s-pw-web-sdk')
  const typeModule = await import('@circle-fin/w3s-pw-web-sdk/dist/src/types')
  circleAuthLog('sdk:import-complete')

  return {
    W3SSdk: sdkModule.W3SSdk as CircleSdkConstructor,
    SocialLoginProvider: typeModule.SocialLoginProvider as { GOOGLE: string },
    ChallengeStatus: typeModule.ChallengeStatus as { COMPLETE: string },
  }
}

function circleConfig() {
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!appId || !googleClientId) {
    throw new Error('Circle login is not configured. Set NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID.')
  }

  if (typeof window === 'undefined') {
    throw new Error('Circle Google login is only available in the browser.')
  }

  const configuredRedirectUri = process.env.NEXT_PUBLIC_CIRCLE_REDIRECT_URI?.trim()
  const redirectUri = normalizeRedirectUri(configuredRedirectUri || `${window.location.origin}/circle/callback`)
  const currentOrigin = normalizeRedirectUri(window.location.origin)

  if (new URL(redirectUri).origin !== currentOrigin) {
    circleAuthLog('redirect-uri:cross-origin', { redirectUri, currentOrigin })
  } else {
    circleAuthLog('redirect-uri:resolved', { redirectUri })
  }

  return { appId, googleClientId, redirectUri }
}

function normalizeRedirectUri(uri: string): string {
  return uri.replace(/\/$/, '')
}

async function circleEndpoint<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/endpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })

  if (!response.ok) {
    throw await walletApiError(response, `Circle ${action} failed.`)
  }

  return response.json() as Promise<T>
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
const CIRCLE_PENDING_LOGIN_KEY = 'vestige_circle_pending_login'
const CIRCLE_PENDING_COOKIE = 'vestige_circle_pending=1'
const CIRCLE_SESSION_COOKIE = 'vestige_circle_session=1'
const PORTFOLIO_STATE_PREFIX = 'vestige_wallet_portfolio:'
const WATCHLIST_STATE_PREFIX = 'vestige_wallet_watchlist:'

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
    localStorage.removeItem(CIRCLE_PENDING_LOGIN_KEY)
    document.cookie = `${CIRCLE_PENDING_COOKIE}; Max-Age=0; Path=/; SameSite=Lax`
    document.cookie = `${CIRCLE_SESSION_COOKIE}; Max-Age=0; Path=/; SameSite=Lax`
  } catch {}
}

function persistCircleSession(session: CircleSession): void {
  try {
    localStorage.setItem(CIRCLE_SESSION_KEY, JSON.stringify({ ...session, updatedAt: new Date().toISOString() }))
    document.cookie = `${CIRCLE_SESSION_COOKIE}; Path=/; Max-Age=2592000; SameSite=Lax`
  } catch {}
}

function portfolioKey(address: string): string {
  return `${PORTFOLIO_STATE_PREFIX}${address.toLowerCase()}`
}

function watchlistKey(address: string): string {
  return `${WATCHLIST_STATE_PREFIX}${address.toLowerCase()}`
}

function persistWalletPortfolioState(state: WalletPortfolioState): WalletPortfolioState {
  try {
    localStorage.setItem(portfolioKey(state.walletAddress), JSON.stringify(state))
  } catch {}
  return state
}

function loadWalletPortfolioState(address: string): WalletPortfolioState | null {
  try {
    const raw = localStorage.getItem(portfolioKey(address))
    return raw ? JSON.parse(raw) as WalletPortfolioState : null
  } catch {
    return null
  }
}

export function loadWalletWatchlist(address: string): string[] {
  try {
    const raw = localStorage.getItem(watchlistKey(address))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveWalletWatchlist(address: string, symbols: string[]): string[] {
  const normalized = Array.from(new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean)))
  try {
    localStorage.setItem(watchlistKey(address), JSON.stringify(normalized))
  } catch {}
  return normalized
}

export function loadCircleSession(): CircleSession | null {
  try {
    const raw = localStorage.getItem(CIRCLE_SESSION_KEY)
    return raw ? JSON.parse(raw) as CircleSession : null
  } catch {
    return null
  }
}

function persistCirclePendingLogin(session: CirclePendingLogin): void {
  try {
    localStorage.setItem(CIRCLE_PENDING_LOGIN_KEY, JSON.stringify(session))
    document.cookie = `${CIRCLE_PENDING_COOKIE}; Path=/; Max-Age=900; SameSite=Lax`
  } catch {}
}

function loadCirclePendingLogin(): CirclePendingLogin | null {
  try {
    const raw = localStorage.getItem(CIRCLE_PENDING_LOGIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CirclePendingLogin> & { provider?: string }
    if (
      parsed.provider !== 'google' ||
      !parsed.deviceId ||
      !parsed.deviceToken ||
      !parsed.deviceEncryptionKey ||
      !parsed.redirectUri ||
      !parsed.returnPath ||
      !parsed.startedAt
    ) {
      clearCirclePendingLogin()
      return null
    }
    return parsed as CirclePendingLogin
  } catch {
    return null
  }
}

function clearCirclePendingLogin(): void {
  try {
    localStorage.removeItem(CIRCLE_PENDING_LOGIN_KEY)
    document.cookie = `${CIRCLE_PENDING_COOKIE}; Max-Age=0; Path=/; SameSite=Lax`
  } catch {}
}

function safeReturnPath(returnPath: string): string | undefined {
  if (!returnPath || !returnPath.startsWith('/')) return undefined
  if (returnPath.startsWith('//')) return undefined
  if (returnPath.startsWith('/circle/callback')) return '/'
  return returnPath
}

function hasPendingCircleLogin(): boolean {
  if (typeof document === 'undefined') return false
  if (loadCirclePendingLogin()) return true
  return document.cookie.split(';').some(part => part.trim().startsWith('vestige_circle_pending='))
}

function clearCircleSdkOAuthState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('socialLoginProvider')
    window.localStorage.removeItem('state')
    window.localStorage.removeItem('nonce')
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.href.split('#')[0])
    }
  } catch {}
}

function circleAuthLog(step: string, details?: Record<string, unknown>): void {
  if (typeof console === 'undefined') return
  const payload = { step, ...details }
  console.info('[vestige:circle]', payload)
}

async function walletApiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const parsed = body as {
    error?: {
      code?: string
      message?: string
      upstream?: {
        status?: number
        statusText?: string
        circleCode?: number | string
        url?: string
        body?: unknown
      }
    }
  }

  if (process.env.NODE_ENV !== 'production' && parsed.error?.upstream?.body) {
    return new Error([
      parsed.error.message ?? fallback,
      '[Circle validation body]',
      JSON.stringify(parsed.error.upstream.body, null, 2),
    ].join('\n'))
  }

  return new Error(parsed.error?.message ?? fallback)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export { ARC_TESTNET, truncateAddress }
