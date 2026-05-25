/**
 * Vestige wallet integration.
 *
 * Strategy: injected EVM wallets as the payment and signing default.
 *
 * Circle social login remains available as an optional wallet identity,
 * but premium payments and publishing use the active wallet abstraction.
 */

import { ARC_TESTNET, ARC_CHAIN_PARAMS, ARC_USDC_CONTRACT_ADDRESS, truncateAddress } from './arc'
import type { PaymentChallenge } from '@/backend/shared/types/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletType = 'circle' | 'injected' | null
export type SelfCustodyConnectorId = 'metamask' | 'rabby' | 'coinbase' | 'browser' | 'walletconnect'

export interface SelfCustodyConnector {
  id: SelfCustodyConnectorId
  name: string
  description: string
  available: boolean
}

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
  isRabby?: boolean
  isCoinbaseWallet?: boolean
  providers?: Eip1193Provider[]
  selectedProvider?: Eip1193Provider
  providerMap?: Map<string, Eip1193Provider> | Record<string, Eip1193Provider>
  _events?: unknown
  name?: string
  rdns?: string
}

interface Eip6963ProviderInfo {
  uuid: string
  name: string
  icon?: string
  rdns?: string
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo
  provider: Eip1193Provider
}

type WalletProgressStage = 'signing_payment_authorization' | 'awaiting_wallet_approval' | 'confirming_payment'

export interface TransactionRequest {
  from?: string
  to?: string
  value?: string
  data?: string
  gas?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
}

export interface TransactionConfirmation {
  transactionHash: string
  status?: string
  blockNumber?: string
  from?: string
  to?: string
}

export interface ChainRequestParameters {
  chainId: string
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: readonly string[]
  blockExplorerUrls?: readonly string[]
}

export interface UnifiedWallet {
  connectWallet: () => Promise<string[]>
  getAddress: () => Promise<string | null>
  signMessage: (message: string, address?: string | null) => Promise<string>
  signTypedData: (typedData: unknown, address?: string | null) => Promise<string>
  sendTransaction: (transaction: TransactionRequest) => Promise<string>
  getProvider: () => Eip1193Provider | null
}

export interface WalletState {
  address: string | null
  walletType: WalletType
  connectorId: SelfCustodyConnectorId | null
  activeAddress?: string | null
  activeWalletType?: WalletType
  activeConnectorId?: SelfCustodyConnectorId | null
  activeProvider?: Eip1193Provider | null
  activeChainId?: number | null
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
  ChallengeStatus: {
    COMPLETE: string
    EXPIRED?: string
    FAILED?: string
    IN_PROGRESS?: string
    PENDING?: string
  }
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

const PRODUCTION_APP_URL = 'https://vestige-ai.vercel.app'
const CIRCLE_CALLBACK_PATH = '/circle/callback'
const CIRCLE_CHALLENGE_TIMEOUT_MS = 150000
const CIRCLE_ARC_BLOCKCHAIN = 'ARC-TESTNET'

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

export async function sendX402PaymentTransaction(
  challenge: PaymentChallenge,
  expectedWalletAddress?: string,
  onProgress?: (stage: WalletProgressStage) => void,
  connectorId?: SelfCustodyConnectorId | null,
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Payment can only be submitted in the browser.')
  }
  if (!isEvmAddress(challenge.payTo) || !isEvmAddress(challenge.assetAddress)) {
    throw new Error('Payment challenge is missing an Arc USDC recipient.')
  }

  const activeConnectorId = connectorId ?? activeConnectorIdFromPersistence()
  const signerAddress = await resolvePaymentSigner(expectedWalletAddress, activeConnectorId)
  onProgress?.('awaiting_wallet_approval')
  await ensureWalletOnArc(activeConnectorId)
  const data = encodeErc20TransferData(challenge.payTo, challenge.maxAmountRequired ?? usdcToAtomicAmount(challenge.amount))
  const txHash = await sendTransaction({
    from: signerAddress,
    to: challenge.assetAddress ?? ARC_USDC_CONTRACT_ADDRESS,
    data,
    value: '0x0',
  }, activeConnectorId)
  onProgress?.('confirming_payment')
  await waitForTransactionConfirmation(txHash, activeConnectorId, { chainId: ARC_TESTNET.chainId })
  return txHash
}

export async function sendArcUsdcTransfer(input: {
  to: string
  amount: string
  expectedWalletAddress?: string
  connectorId?: SelfCustodyConnectorId | null
  onProgress?: (stage: WalletProgressStage) => void
}): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Payment can only be submitted in the browser.')
  }
  if (!isEvmAddress(input.to)) {
    throw new Error('USDC transfer recipient is invalid.')
  }

  const activeConnectorId = input.connectorId ?? activeConnectorIdFromPersistence()
  const signerAddress = await resolvePaymentSigner(input.expectedWalletAddress, activeConnectorId)
  input.onProgress?.('awaiting_wallet_approval')
  await ensureWalletOnArc(activeConnectorId)
  const txHash = await sendTransaction({
    from: signerAddress,
    to: ARC_USDC_CONTRACT_ADDRESS,
    data: encodeErc20TransferData(input.to, usdcToAtomicAmount(input.amount)),
    value: '0x0',
  }, activeConnectorId)
  input.onProgress?.('confirming_payment')
  await waitForTransactionConfirmation(txHash, activeConnectorId, { chainId: ARC_TESTNET.chainId })
  return txHash
}

async function resolvePaymentSigner(
  expectedWalletAddress: string | undefined,
  connectorId: SelfCustodyConnectorId | null,
): Promise<string> {
  const provider = getProvider(connectorId)
  const fallbackProvider = provider ?? getProvider('browser')
  if (!fallbackProvider) {
    throw new Error('Connect an EVM wallet before unlocking paid intelligence.')
  }

  const accounts = await fallbackProvider.request({ method: 'eth_accounts' }) as string[]
  const resolvedAccounts = accounts.length > 0 ? accounts : await requestAccounts(connectorId ?? 'browser')
  const address = resolvedAccounts[0] ?? await getAddress(connectorId)
  if (!address) {
    throw new Error(`Connect ${connectorLabel(connectorId)} before unlocking paid intelligence.`)
  }

  if (expectedWalletAddress && normalizeAddress(expectedWalletAddress) !== normalizeAddress(address)) {
    throw new Error('Connected wallet does not match the wallet used to unlock the trace.')
  }

  return address
}

function activeConnectorIdFromPersistence(): SelfCustodyConnectorId {
  const persisted = loadPersistedWallet()
  return persisted?.walletType === 'injected'
    ? persisted.connectorId ?? 'browser'
    : 'browser'
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
    const challenge = await executeCircleChallenge(sdk, runtime, initialized.challengeId)
    circleAuthLog('challenge:execute-complete', { status: challenge?.status })
  } else if (initialized.alreadyInitialized) {
    circleAuthLog('initialize:already-initialized')
  } else {
    throw new Error('Circle did not return an initialization challenge or existing-user state.')
  }

  let wallets = await listCircleWalletsWithRetry(loginResult.userToken)
  let wallet = selectCircleWallet(wallets)
  if (!wallet?.address) {
    circleAuthLog('wallet:create-start')
    const created = await circleEndpoint<{ challengeId?: string }>('createWallet', {
      userToken: loginResult.userToken,
      accountType: 'SCA',
    })
    if (!created.challengeId) {
      throw new Error('Circle did not return a wallet creation challenge.')
    }
    const challenge = await executeCircleChallenge(sdk, runtime, created.challengeId)
    circleAuthLog('wallet:create-complete', { status: challenge?.status })
    wallets = await listCircleWalletsWithRetry(loginResult.userToken)
    wallet = selectCircleWallet(wallets)
  }

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
    let pendingTimer: number | null = null
    const clearPendingTimer = () => {
      if (!pendingTimer) return
      window.clearTimeout(pendingTimer)
      pendingTimer = null
    }
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      clearPendingTimer()
      reject(new Error('Circle wallet setup timed out. Please try connecting again.'))
    }, CIRCLE_CHALLENGE_TIMEOUT_MS)

    sdk.execute(challengeId, (error, result) => {
      if (settled) return

      if (error) {
        settled = true
        window.clearTimeout(timeout)
        clearPendingTimer()
        reject(new CircleWalletOperationError(error.message ?? 'Circle wallet challenge failed.', error.code))
        return
      }

      const status = result?.status
      if (isCircleChallengeSuccess(status, runtime)) {
        settled = true
        window.clearTimeout(timeout)
        clearPendingTimer()
        resolve(result)
        return
      }

      if (isCircleChallengePending(status, runtime)) {
        circleAuthLog('challenge:pending', { status })
        clearPendingTimer()
        pendingTimer = window.setTimeout(() => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          resolve(result)
        }, 2500)
        return
      }

      if (status) {
        settled = true
        window.clearTimeout(timeout)
        clearPendingTimer()
        reject(new CircleWalletOperationError(circleChallengeFailureMessage(status)))
        return
      }

      settled = true
      window.clearTimeout(timeout)
      clearPendingTimer()
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
  return wallets.find(item => item.blockchain === CIRCLE_ARC_BLOCKCHAIN) ?? null
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

  const appOrigin = resolveAppOrigin()
  const configuredRedirectUri = process.env.NEXT_PUBLIC_CIRCLE_REDIRECT_URI?.trim()
  const redirectUri = resolveCircleRedirectUri(configuredRedirectUri, appOrigin)
  const currentOrigin = normalizeOrigin(window.location.origin)

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

function resolveAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const candidate = configured || browserOrigin || PRODUCTION_APP_URL
  const origin = normalizeOrigin(candidate)

  if (isLocalOrigin(origin) && browserOrigin && !isLocalOrigin(browserOrigin)) {
    return PRODUCTION_APP_URL
  }

  return origin
}

function resolveCircleRedirectUri(configuredRedirectUri: string | undefined, appOrigin: string): string {
  const fallback = `${appOrigin}${CIRCLE_CALLBACK_PATH}`
  if (!configuredRedirectUri) return fallback

  try {
    const url = new URL(configuredRedirectUri, appOrigin)
    if (isLocalOrigin(url.origin) && !isLocalOrigin(appOrigin)) {
      return fallback
    }
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = CIRCLE_CALLBACK_PATH
    }
    url.hash = ''
    return normalizeRedirectUri(url.toString())
  } catch {
    return fallback
  }
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return normalizeRedirectUri(value)
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
  } catch {
    return false
  }
}

function isCircleChallengeSuccess(status: string | undefined, runtime: CircleRuntime): boolean {
  return !status || status === runtime.ChallengeStatus.COMPLETE || status === 'COMPLETE'
}

function isCircleChallengePending(status: string | undefined, runtime: CircleRuntime): boolean {
  return status === runtime.ChallengeStatus.IN_PROGRESS ||
    status === runtime.ChallengeStatus.PENDING ||
    status === 'IN_PROGRESS' ||
    status === 'PENDING'
}

function circleChallengeFailureMessage(status: string): string {
  if (status === 'EXPIRED') return 'Circle wallet setup expired. Start Google login again.'
  if (status === 'FAILED') return 'Circle wallet setup failed. Try again or use a browser wallet.'
  return `Circle wallet setup ended with status ${status}.`
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

function usdcToAtomicAmount(amount: string): string {
  const normalized = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) return '0'
  const [whole, fraction = ''] = normalized.split('.')
  const atomic = `${whole}${fraction.padEnd(6, '0').slice(0, 6)}`.replace(/^0+(?=\d)/, '')
  return atomic || '0'
}

function encodeErc20TransferData(to: string, atomicAmount: string): string {
  if (!isEvmAddress(to)) throw new Error('USDC transfer recipient is invalid.')
  const amount = BigInt(atomicAmount)
  if (amount <= 0n) throw new Error('USDC transfer amount is invalid.')
  return `0xa9059cbb${normalizeAddress(to).slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`
}

function isEvmAddress(value: string | undefined): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value))
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

// ─── Injected wallet (MetaMask / EIP-1193) helpers ───────────────────────────

const eip6963Providers = new Map<string, Eip6963ProviderDetail>()
const injectedProviderSources = new WeakMap<Eip1193Provider, string>()
let eip6963Listening = false

function ensureEip6963Discovery(): void {
  if (typeof window === 'undefined' || eip6963Listening) return
  eip6963Listening = true
  window.addEventListener('eip6963:announceProvider', ((event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail
    if (!detail?.provider?.request || !detail.info?.uuid) return
    eip6963Providers.set(detail.info.uuid, detail)
  }) as EventListener)
}

export function requestInjectedProviderDiscovery(): void {
  if (typeof window === 'undefined') return
  ensureEip6963Discovery()
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

function getInjectedProviders(): Eip1193Provider[] {
  if (typeof window === 'undefined') return []
  ensureEip6963Discovery()
  const providers: Eip1193Provider[] = []
  const addProvider = (provider: Eip1193Provider | undefined, source?: string) => {
    if (!provider?.request) return
    const flattened = flattenInjectedProviders(provider)
    for (const candidate of flattened) {
      if (source) injectedProviderSources.set(candidate, source)
      providers.push(candidate)
    }
  }
  for (const detail of eip6963Providers.values()) {
    providers.push(detail.provider)
  }
  const walletWindow = window as Window & {
    ethereum?: Eip1193Provider
    rabby?: Eip1193Provider
    rabbyWallet?: Eip1193Provider
    coinbaseWalletExtension?: Eip1193Provider
  }
  addProvider(walletWindow.ethereum, 'window.ethereum')
  addProvider(walletWindow.rabby, 'rabby')
  addProvider(walletWindow.rabbyWallet, 'rabby')
  addProvider(walletWindow.coinbaseWalletExtension, 'coinbase wallet')
  return uniqueProviders(providers)
}

function flattenInjectedProviders(provider: Eip1193Provider): Eip1193Provider[] {
  const providers: Eip1193Provider[] = []
  const visit = (candidate?: Eip1193Provider | null) => {
    if (!candidate?.request || providers.includes(candidate)) return
    const nested = Array.isArray(candidate.providers) ? candidate.providers : []
    for (const nestedProvider of nested) visit(nestedProvider)
    if (candidate.selectedProvider) visit(candidate.selectedProvider)
    if (candidate.providerMap instanceof Map) {
      for (const mappedProvider of candidate.providerMap.values()) visit(mappedProvider)
    } else if (isRecord(candidate.providerMap)) {
      for (const mappedProvider of Object.values(candidate.providerMap)) {
        visit(mappedProvider as Eip1193Provider)
      }
    }
    providers.push(candidate)
  }
  visit(provider)
  return providers
}

function uniqueProviders(providers: Eip1193Provider[]): Eip1193Provider[] {
  const seen = new Set<Eip1193Provider>()
  return providers.filter(provider => {
    if (!provider?.request || seen.has(provider)) return false
    seen.add(provider)
    return true
  })
}

function inferredProviderInfo(provider: Eip1193Provider, index: number): Eip6963ProviderInfo {
  const identity = providerIdentityText(provider)
  if (provider.isRabby || identity.includes('rabby')) {
    return { uuid: `injected-rabby-${index}`, name: 'Rabby', rdns: 'io.rabby' }
  }
  if (provider.isCoinbaseWallet || identity.includes('coinbase')) {
    return { uuid: `injected-coinbase-${index}`, name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet' }
  }
  if (provider.isMetaMask || identity.includes('metamask')) {
    return { uuid: `injected-metamask-${index}`, name: 'MetaMask', rdns: 'io.metamask' }
  }
  return { uuid: `injected-browser-${index}`, name: 'Browser Wallet', rdns: 'injected' }
}

function getProviderEntry(connectorId?: SelfCustodyConnectorId | null): Eip6963ProviderDetail | null {
  if (connectorId === 'walletconnect') return null

  const announced = [...eip6963Providers.values()]
  const entries = getInjectedProviders().map((provider, index) => {
    const known = announced.find(detail => detail.provider === provider)
    return known ?? { info: inferredProviderInfo(provider, index), provider }
  })

  if (connectorId === 'metamask') return entries.find(entry => matchesConnector(entry, 'metamask')) ?? null
  if (connectorId === 'rabby') return entries.find(entry => matchesConnector(entry, 'rabby')) ?? null
  if (connectorId === 'coinbase') return entries.find(entry => matchesConnector(entry, 'coinbase')) ?? null
  if (connectorId === 'browser') return entries[0] ?? null

  const persisted = loadPersistedWallet()
  if (persisted?.walletType === 'injected' && persisted.connectorId && persisted.connectorId !== 'walletconnect') {
    const persistedEntry = entries.find(entry => matchesConnector(entry, persisted.connectorId as Exclude<SelfCustodyConnectorId, 'walletconnect'>))
    if (persistedEntry) return persistedEntry
  }

  return entries.find(entry => matchesConnector(entry, 'rabby')) ??
    entries.find(entry => matchesConnector(entry, 'metamask')) ??
    entries.find(entry => matchesConnector(entry, 'coinbase')) ??
    entries[0] ??
    null
}

function matchesConnector(
  entry: Eip6963ProviderDetail,
  connectorId: Exclude<SelfCustodyConnectorId, 'walletconnect'>,
): boolean {
  const identity = providerIdentityText(entry.provider, entry.info)
  if (connectorId === 'rabby') return Boolean(entry.provider.isRabby || identity.includes('rabby'))
  if (connectorId === 'coinbase') return Boolean(entry.provider.isCoinbaseWallet || identity.includes('coinbase'))
  if (connectorId === 'metamask') {
    return Boolean(
      !entry.provider.isRabby &&
      !identity.includes('rabby') &&
      (entry.provider.isMetaMask || identity.includes('metamask')),
    )
  }
  return true
}

function providerIdentityText(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>): string {
  const parts: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) parts.push(value.trim())
  }

  add(info?.name)
  add(info?.rdns)
  add(provider.name)
  add(provider.rdns)
  add(injectedProviderSources.get(provider))
  if (provider.isRabby) parts.push('rabby')
  if (provider.isCoinbaseWallet) parts.push('coinbase wallet')
  if (provider.isMetaMask) parts.push('metamask')

  const maybeEvents = provider._events
  if (isRecord(maybeEvents)) {
    add(maybeEvents.name)
  }

  return parts.join(' ').toLowerCase()
}

function connectorLabel(connectorId?: SelfCustodyConnectorId | null): string {
  if (connectorId === 'metamask') return 'MetaMask'
  if (connectorId === 'rabby') return 'Rabby'
  if (connectorId === 'coinbase') return 'Coinbase Wallet'
  if (connectorId === 'walletconnect') return 'WalletConnect'
  return 'browser wallet'
}

export function getProvider(connectorId?: SelfCustodyConnectorId | null): Eip1193Provider | null {
  return getProviderEntry(connectorId)?.provider ?? null
}

function getProviderWithFallback(connectorId?: SelfCustodyConnectorId | null): Eip1193Provider | null {
  if (!connectorId || connectorId === 'browser') return getProvider(connectorId) ?? getProvider('browser')
  return getProvider(connectorId)
}

export function listSelfCustodyConnectors(): SelfCustodyConnector[] {
  requestInjectedProviderDiscovery()
  const browserAvailable = Boolean(getProvider('browser'))
  return [
    { id: 'metamask', name: 'MetaMask', description: 'Injected browser wallet', available: Boolean(getProvider('metamask')) },
    { id: 'rabby', name: 'Rabby', description: 'Injected browser wallet', available: Boolean(getProvider('rabby')) },
    { id: 'coinbase', name: 'Coinbase Wallet', description: 'Injected browser wallet', available: Boolean(getProvider('coinbase')) },
    { id: 'browser', name: 'Browser Wallet', description: 'Use whichever EVM wallet is available', available: browserAvailable },
    { id: 'walletconnect', name: 'WalletConnect', description: 'Mobile/session connector', available: false },
  ]
}

export async function connectWallet(connectorId?: SelfCustodyConnectorId | null): Promise<string[]> {
  return requestAccounts(connectorId ?? 'browser')
}

export function createWalletInterface(connectorId?: SelfCustodyConnectorId | null): UnifiedWallet {
  const activeConnectorId = connectorId ?? activeConnectorIdFromPersistence()
  return {
    connectWallet: () => connectWallet(activeConnectorId),
    getAddress: () => getAddress(activeConnectorId),
    signMessage: (message, address) => signMessage(message, address, activeConnectorId),
    signTypedData: (typedData, address) => signTypedData(typedData, address, activeConnectorId),
    sendTransaction: (transaction) => sendTransaction(transaction, activeConnectorId),
    getProvider: () => getProvider(activeConnectorId),
  }
}

export function getActiveWallet(connectorId?: SelfCustodyConnectorId | null): UnifiedWallet {
  return createWalletInterface(connectorId)
}

export async function requestAccounts(connectorId: SelfCustodyConnectorId = 'browser'): Promise<string[]> {
  requestInjectedProviderDiscovery()
  const provider = getProviderWithFallback(connectorId)
  if (!provider) {
    if (connectorId === 'walletconnect') {
      throw new Error('WalletConnect is not configured in this build.')
    }
    throw new Error(`No ${connectorLabel(connectorId)} provider found.`)
  }
  return provider.request({ method: 'eth_requestAccounts' }) as Promise<string[]>
}

export async function getAddress(connectorId?: SelfCustodyConnectorId | null): Promise<string | null> {
  const provider = getProviderWithFallback(connectorId)
  if (!provider) return null
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
  return accounts[0] ?? null
}

export async function getChainId(connectorId?: SelfCustodyConnectorId | null): Promise<number> {
  const provider = getProviderWithFallback(connectorId)
  if (!provider) return 0
  const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string
  return parseInt(chainIdHex, 16)
}

export async function signMessage(
  message: string,
  address?: string | null,
  connectorId?: SelfCustodyConnectorId | null,
): Promise<string> {
  const signer = address ?? await getAddress(connectorId)
  if (!signer) throw new Error('Connect an EVM wallet before signing.')
  const provider = getProviderWithFallback(connectorId)
  if (!provider) throw new Error('No connected EVM wallet provider found.')
  return provider.request({ method: 'personal_sign', params: [message, signer] }) as Promise<string>
}

export async function signTypedData(
  typedData: unknown,
  address?: string | null,
  connectorId?: SelfCustodyConnectorId | null,
): Promise<string> {
  const signer = address ?? await getAddress(connectorId)
  if (!signer) throw new Error('Connect an EVM wallet before signing.')
  const provider = getProviderWithFallback(connectorId)
  if (!provider) throw new Error('No connected EVM wallet provider found.')
  return provider.request({
    method: 'eth_signTypedData_v4',
    params: [signer, JSON.stringify(typedData)],
  }) as Promise<string>
}

export async function sendTransaction(
  transaction: TransactionRequest,
  connectorId?: SelfCustodyConnectorId | null,
): Promise<string> {
  const provider = getProviderWithFallback(connectorId)
  if (!provider) throw new Error('No connected EVM wallet provider found.')
  const from = transaction.from ?? await getAddress(connectorId)
  if (!from) throw new Error('Connect an EVM wallet before sending a transaction.')
  return provider.request({
    method: 'eth_sendTransaction',
    params: [{ ...transaction, from }],
  }) as Promise<string>
}

export async function waitForTransactionConfirmation(
  txHash: string,
  connectorId?: SelfCustodyConnectorId | null,
  options?: { chainId?: number; timeoutMs?: number; pollIntervalMs?: number },
): Promise<TransactionConfirmation> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error('Transaction hash is invalid.')
  }

  const provider = getProviderWithFallback(connectorId)
  if (!provider) throw new Error('No connected EVM wallet provider found.')

  const expectedChainId = options?.chainId
  if (expectedChainId) {
    const activeChainId = await getChainId(connectorId)
    if (activeChainId !== expectedChainId) {
      throw new Error(`Wallet is on chain ${activeChainId}; expected chain ${expectedChainId}.`)
    }
  }

  const timeoutMs = options?.timeoutMs ?? 60000
  const pollIntervalMs = options?.pollIntervalMs ?? 1500
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }) as TransactionConfirmation | null

    if (receipt) {
      if (receipt.status && receipt.status !== '0x1') {
        throw new Error('Transaction reverted onchain.')
      }
      return receipt
    }

    await delay(pollIntervalMs)
  }

  throw new Error('Transaction confirmation timed out.')
}

export async function ensureWalletOnArc(connectorId?: SelfCustodyConnectorId | null): Promise<void> {
  const chainId = await getChainId(connectorId)
  if (chainId === ARC_TESTNET.chainId) return
  await switchToArcNetwork(connectorId)
}

export async function switchToArcNetwork(connectorId?: SelfCustodyConnectorId | null): Promise<void> {
  await switchToEthereumChain(ARC_CHAIN_PARAMS, connectorId)
}

export async function switchToEthereumChain(params: ChainRequestParameters, connectorId?: SelfCustodyConnectorId | null): Promise<void> {
  const provider = getProviderWithFallback(connectorId)
  if (!provider) throw new Error('No injected EVM wallet found.')

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: params.chainId }],
    })
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [params],
      })
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: params.chainId }],
      })
    } else {
      throw err
    }
  }
}

export function onAccountsChanged(callback: (accounts: string[]) => void, connectorId?: SelfCustodyConnectorId | null): () => void {
  const provider = getProviderWithFallback(connectorId)
  if (!provider) return () => {}
  const typed = provider as unknown as { on?: (event: string, cb: (accounts: string[]) => void) => void; removeListener?: (event: string, cb: (accounts: string[]) => void) => void }
  typed.on?.('accountsChanged', callback)
  return () => typed.removeListener?.('accountsChanged', callback)
}

export function onChainChanged(callback: (chainId: string) => void, connectorId?: SelfCustodyConnectorId | null): () => void {
  const provider = getProviderWithFallback(connectorId)
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
  connectorId?: SelfCustodyConnectorId | null
}

export function persistWallet(
  address: string,
  walletType: WalletType,
  connectorId: SelfCustodyConnectorId | null = null,
): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ address, walletType, connectorId }))
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
  if (typeof console === 'undefined' || process.env.NODE_ENV === 'production') return
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
