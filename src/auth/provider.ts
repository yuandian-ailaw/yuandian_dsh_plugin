import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { listenForOAuthCallback } from './callback.js'
import type { OAuthCallbackListener, OAuthCallbackOptions } from './callback.js'
import { openExternalUrl } from './browser.js'
import type { OpenAuthorizationUrl } from './browser.js'
import { DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF } from './constants.js'
import { AuthenticationRequiredError } from './errors.js'
import { OAuthCredentialStore, asCredentialRef } from './store.js'
import { safeErrorMessage } from '../logging.js'

type CallbackFactory = (options: OAuthCallbackOptions) => Promise<OAuthCallbackListener>

export interface YuandianOAuthProviderOptions {
  readonly credentialRef: string
  readonly authorizedCredentialRef?: string
  readonly callbackPort: number
  readonly timeoutMs: number
  readonly openBrowser: boolean
  readonly signal?: AbortSignal
  readonly callbackFactory?: CallbackFactory
  readonly opener?: OpenAuthorizationUrl
  readonly allowInteractiveAuthorization?: () => boolean
}

export class YuandianOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl: URL
  readonly clientMetadata: OAuthClientMetadata
  private readonly store: OAuthCredentialStore
  private readonly authorizedCredentialRef
  private readonly callbackFactory: CallbackFactory
  private readonly opener: OpenAuthorizationUrl
  private listener: OAuthCallbackListener | undefined
  private pendingCode: Promise<string> | undefined

  constructor(
    private readonly ctx: Context,
    private readonly options: YuandianOAuthProviderOptions,
  ) {
    this.redirectUrl = new URL(`http://127.0.0.1:${options.callbackPort}/oauth/callback`)
    this.clientMetadata = {
      client_name: '华宇元典法律数据',
      redirect_uris: [this.redirectUrl.toString()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp',
    }
    this.store = new OAuthCredentialStore(ctx.credentials, options.credentialRef)
    this.authorizedCredentialRef = asCredentialRef(options.authorizedCredentialRef ?? DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF)
    this.callbackFactory = options.callbackFactory ?? listenForOAuthCallback
    this.opener = options.opener ?? openExternalUrl
  }

  state(): string {
    return randomBytes(32).toString('base64url')
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return (await this.store.read()).clientInformation
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.store.update(current => ({ ...current, clientInformation }))
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = (await this.store.read()).tokens
    if (tokens === undefined) await this.clearAuthorizedMarker()
    else await this.markAuthorized()
    return tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.store.update(current => ({ ...current, tokens }))
    await this.markAuthorized()
    this.ctx.logger.debug('华宇元典法律数据：OAuth Token 已安全更新')
  }

  private async markAuthorized(): Promise<void> {
    const current = await this.ctx.credentials.resolve(this.authorizedCredentialRef)
    if (current === undefined) await this.ctx.credentials.set(this.authorizedCredentialRef, '1')
  }

  private async clearAuthorizedMarker(): Promise<void> {
    const current = await this.ctx.credentials.resolve(this.authorizedCredentialRef)
    if (current !== undefined) await this.ctx.credentials.unset(this.authorizedCredentialRef)
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.store.update(current => ({ ...current, codeVerifier }))
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await this.store.read()).codeVerifier
    if (verifier === undefined) throw new Error('OAuth PKCE verifier 不存在，请重新发起授权')
    return verifier
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    await this.store.update(current => ({ ...current, discoveryState }))
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await this.store.read()).discoveryState
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'all') {
      await this.store.clear()
      await this.clearAuthorizedMarker()
      this.ctx.logger.debug('华宇元典法律数据：OAuth 凭证已清理')
      return
    }
    await this.store.update((current) => {
      const next = { ...current } as {
        version: 1
        clientInformation?: OAuthClientInformationMixed
        tokens?: OAuthTokens
        codeVerifier?: string
        discoveryState?: OAuthDiscoveryState
      }
      if (scope === 'client') delete next.clientInformation
      if (scope === 'tokens') delete next.tokens
      if (scope === 'verifier') delete next.codeVerifier
      if (scope === 'discovery') delete next.discoveryState
      return next
    })
    if (scope === 'tokens') await this.clearAuthorizedMarker()
    this.ctx.logger.debug('华宇元典法律数据：OAuth %s 状态已失效', scope)
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.options.allowInteractiveAuthorization?.() === false) {
      try {
        await this.invalidateCredentials('all')
      } catch (error) {
        this.ctx.logger.warn('华宇元典法律数据：清理失效 OAuth 凭证失败：%s', safeErrorMessage(error))
      }
      this.ctx.logger.debug('华宇元典法律数据：OAuth 需要用户重新授权，等待在设置页主动发起')
      throw new AuthenticationRequiredError()
    }
    await this.closePendingAuthorization()
    const expectedState = authorizationUrl.searchParams.get('state')
    if (expectedState === null || expectedState === '') throw new Error('OAuth 授权地址缺少 state')

    const listener = await this.callbackFactory({
      port: this.options.callbackPort,
      path: this.redirectUrl.pathname,
      expectedState,
      timeoutMs: this.options.timeoutMs,
      ...(this.options.signal !== undefined ? { signal: this.options.signal } : {}),
    })
    this.listener = listener
    this.pendingCode = listener.code.finally(() => {
      if (this.listener === listener) this.listener = undefined
    })

    const opened = this.options.openBrowser && await this.opener(authorizationUrl)
    if (opened) {
      this.ctx.logger.debug('华宇元典法律数据：已打开浏览器等待 OAuth 授权')
    } else {
      this.ctx.logger.warn('华宇元典法律数据：请在浏览器打开以下授权地址：%s', authorizationUrl.toString())
    }
  }

  async waitForAuthorizationCode(): Promise<string> {
    if (this.pendingCode === undefined) throw new Error('OAuth 授权尚未开始')
    const pending = this.pendingCode
    try {
      return await pending
    } finally {
      if (this.pendingCode === pending) this.pendingCode = undefined
    }
  }

  async closePendingAuthorization(): Promise<void> {
    const listener = this.listener
    this.listener = undefined
    this.pendingCode = undefined
    await listener?.close()
  }
}
