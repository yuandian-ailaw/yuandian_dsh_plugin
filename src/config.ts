import { DEFAULT_API_KEY_CREDENTIAL_REF, DEFAULT_OAUTH_CREDENTIAL_REF } from './auth/constants.js'

export interface OAuthConfig {
  readonly mode: 'oauth'
  readonly credentialRef?: string
  readonly callbackPort?: number
  readonly openBrowser?: boolean
  readonly timeoutMs?: number
}

export interface ApiKeyConfig {
  readonly mode: 'api-key'
  readonly credentialRef?: string
}

export interface AutoAuthConfig {
  readonly mode: 'auto'
  readonly callbackPort?: number
  readonly openBrowser?: boolean
  readonly timeoutMs?: number
}

export interface ReconnectConfig {
  readonly enabled?: boolean
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly maxAttempts?: number
}

export interface Config {
  readonly endpoint?: string
  readonly serverName?: string
  readonly auth?: AutoAuthConfig | OAuthConfig | ApiKeyConfig
  readonly httpTimeoutMs?: number
  readonly toolCallTimeoutMs?: number
  readonly failOnStartupError?: boolean
  readonly reconnect?: ReconnectConfig
}

export interface ResolvedOAuthConfig {
  readonly mode: 'oauth'
  readonly credentialRef: string
  readonly callbackPort: number
  readonly openBrowser: boolean
  readonly timeoutMs: number
}

export interface ResolvedApiKeyConfig {
  readonly mode: 'api-key'
  readonly credentialRef: string
}

export interface ResolvedAutoAuthConfig {
  readonly mode: 'auto'
  readonly oauthCredentialRef: string
  readonly apiKeyCredentialRef: string
  readonly callbackPort: number
  readonly openBrowser: boolean
  readonly timeoutMs: number
}

export interface ResolvedConfig {
  readonly endpoint: string
  readonly serverName: string
  readonly auth: ResolvedAutoAuthConfig | ResolvedOAuthConfig | ResolvedApiKeyConfig
  readonly httpTimeoutMs: number
  readonly toolCallTimeoutMs: number
  readonly failOnStartupError: boolean
  readonly reconnect: Required<ReconnectConfig>
}

export const DEFAULT_CONFIG = Object.freeze({
  endpoint: 'https://open.chineselaw.com/mcp',
  serverName: 'yuandian',
  auth: Object.freeze({
    mode: 'auto' as const,
    oauthCredentialRef: DEFAULT_OAUTH_CREDENTIAL_REF,
    apiKeyCredentialRef: DEFAULT_API_KEY_CREDENTIAL_REF,
    callbackPort: 1455,
    openBrowser: true,
    timeoutMs: 300_000,
  }),
  httpTimeoutMs: 60_000,
  toolCallTimeoutMs: 60_000,
  failOnStartupError: true,
  reconnect: Object.freeze({
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    maxAttempts: 10,
  }),
})

function positiveNumber(value: number, path: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${path} 必须是正数`)
  return value
}

export function resolveConfig(config: Config = {}): ResolvedConfig {
  const endpoint = config.endpoint ?? DEFAULT_CONFIG.endpoint
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('endpoint 只支持 http 或 https')
  if (url.username !== '' || url.password !== '') throw new Error('endpoint 不得包含用户名或密码')
  const hostname = url.hostname.toLowerCase()
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  if (url.protocol === 'http:' && !loopback) throw new Error('非本机 endpoint 必须使用 https')
  const serverName = config.serverName ?? DEFAULT_CONFIG.serverName
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) throw new Error('serverName 必须匹配 [A-Za-z0-9_-]{1,32}')

  const rawAuth = config.auth ?? DEFAULT_CONFIG.auth
  const auth: ResolvedAutoAuthConfig | ResolvedOAuthConfig | ResolvedApiKeyConfig = rawAuth.mode === 'api-key'
    ? { mode: 'api-key', credentialRef: rawAuth.credentialRef ?? DEFAULT_API_KEY_CREDENTIAL_REF }
    : rawAuth.mode === 'oauth'
      ? {
        mode: 'oauth',
        credentialRef: rawAuth.credentialRef ?? DEFAULT_OAUTH_CREDENTIAL_REF,
        callbackPort: rawAuth.callbackPort ?? DEFAULT_CONFIG.auth.callbackPort,
        openBrowser: rawAuth.openBrowser ?? DEFAULT_CONFIG.auth.openBrowser,
        timeoutMs: positiveNumber(rawAuth.timeoutMs ?? DEFAULT_CONFIG.auth.timeoutMs, 'auth.timeoutMs'),
      }
      : {
          mode: 'auto',
          oauthCredentialRef: DEFAULT_OAUTH_CREDENTIAL_REF,
          apiKeyCredentialRef: DEFAULT_API_KEY_CREDENTIAL_REF,
          callbackPort: rawAuth.callbackPort ?? DEFAULT_CONFIG.auth.callbackPort,
          openBrowser: rawAuth.openBrowser ?? DEFAULT_CONFIG.auth.openBrowser,
          timeoutMs: positiveNumber(rawAuth.timeoutMs ?? DEFAULT_CONFIG.auth.timeoutMs, 'auth.timeoutMs'),
        }
  if (auth.mode !== 'api-key' && (!Number.isInteger(auth.callbackPort) || auth.callbackPort < 1 || auth.callbackPort > 65_535)) {
    throw new Error('auth.callbackPort 必须是 1 到 65535 之间的整数')
  }

  const reconnect = {
    enabled: config.reconnect?.enabled ?? DEFAULT_CONFIG.reconnect.enabled,
    initialDelayMs: positiveNumber(config.reconnect?.initialDelayMs ?? DEFAULT_CONFIG.reconnect.initialDelayMs, 'reconnect.initialDelayMs'),
    maxDelayMs: positiveNumber(config.reconnect?.maxDelayMs ?? DEFAULT_CONFIG.reconnect.maxDelayMs, 'reconnect.maxDelayMs'),
    maxAttempts: config.reconnect?.maxAttempts ?? DEFAULT_CONFIG.reconnect.maxAttempts,
  }
  if (reconnect.initialDelayMs > reconnect.maxDelayMs) throw new Error('reconnect.initialDelayMs 不能大于 maxDelayMs')
  if (!Number.isInteger(reconnect.maxAttempts) || reconnect.maxAttempts < 1) throw new Error('reconnect.maxAttempts 必须是正整数')

  return Object.freeze({
    endpoint: url.toString(),
    serverName,
    auth,
    httpTimeoutMs: positiveNumber(config.httpTimeoutMs ?? DEFAULT_CONFIG.httpTimeoutMs, 'httpTimeoutMs'),
    toolCallTimeoutMs: positiveNumber(config.toolCallTimeoutMs ?? DEFAULT_CONFIG.toolCallTimeoutMs, 'toolCallTimeoutMs'),
    failOnStartupError: config.failOnStartupError ?? DEFAULT_CONFIG.failOnStartupError,
    reconnect: Object.freeze(reconnect),
  })
}
