import type { Context } from '@deepseek-ai/cordis'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ResolvedConfig } from '../config.js'
import { AuthenticationRequiredError } from '../auth/errors.js'
import { YuandianOAuthProvider } from '../auth/provider.js'
import { asCredentialRef, resolveApiKey } from '../auth/store.js'

export { AuthenticationRequiredError } from '../auth/errors.js'

export function createTimedFetch(timeoutMs: number, fetchFn: FetchLike = fetch): FetchLike {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers)
    const isEventStream = (init.method ?? 'GET').toUpperCase() === 'GET'
      && headers.get('accept')?.includes('text/event-stream') === true
    if (isEventStream) {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(new Error(`MCP SSE 握手超过 ${timeoutMs}ms`)), timeoutMs)
      const signal = init.signal === undefined || init.signal === null
        ? timeout.signal
        : AbortSignal.any([init.signal, timeout.signal])
      try {
        return await fetchFn(input, { ...init, signal })
      } finally {
        clearTimeout(timer)
      }
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = init.signal === undefined || init.signal === null
      ? timeoutSignal
      : AbortSignal.any([init.signal, timeoutSignal])
    return fetchFn(input, { ...init, signal })
  }
}

export class McpAuthentication {
  private readonly oauthProvider: YuandianOAuthProvider | undefined
  private oauthTransport: StreamableHTTPClientTransport | undefined
  private oauthRequested = false
  private interactiveOAuthAllowed = false

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
    signal?: AbortSignal,
  ) {
    const oauth = config.auth.mode === 'oauth'
      ? config.auth
      : config.auth.mode === 'auto'
        ? {
            credentialRef: config.auth.oauthCredentialRef,
            callbackPort: config.auth.callbackPort,
            openBrowser: config.auth.openBrowser,
            timeoutMs: config.auth.timeoutMs,
          }
        : undefined
    this.oauthProvider = oauth === undefined
      ? undefined
      : new YuandianOAuthProvider(ctx, {
          ...oauth,
          allowInteractiveAuthorization: () => {
            if (this.config.auth.mode === 'oauth') return true
            const allowed = this.interactiveOAuthAllowed
            this.interactiveOAuthAllowed = false
            return allowed
          },
          ...(signal !== undefined ? { signal } : {}),
        })
  }

  async createTransport(): Promise<StreamableHTTPClientTransport> {
    this.oauthTransport = undefined
    if (this.config.auth.mode === 'api-key') {
      const apiKey = await resolveApiKey(this.ctx.credentials, this.config.auth.credentialRef)
      return new StreamableHTTPClientTransport(new URL(this.config.endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
        fetch: createTimedFetch(this.config.httpTimeoutMs),
      })
    }
    if (this.config.auth.mode === 'auto') {
      const oauthRequested = this.oauthRequested
      this.oauthRequested = false
      this.interactiveOAuthAllowed = oauthRequested
      if (!oauthRequested) {
        const resolved = await this.ctx.credentials.resolve(asCredentialRef(this.config.auth.apiKeyCredentialRef))
        if (resolved !== undefined) {
          return new StreamableHTTPClientTransport(new URL(this.config.endpoint), {
            requestInit: { headers: { Authorization: `Bearer ${resolved.value}` } },
            fetch: createTimedFetch(this.config.httpTimeoutMs),
          })
        }
      }
      const tokens = await this.oauthProvider?.tokens()
      if (tokens === undefined && !oauthRequested) throw new AuthenticationRequiredError()
    }
    if (this.oauthProvider === undefined) throw new Error('OAuth provider 未初始化')
    const transport = new StreamableHTTPClientTransport(new URL(this.config.endpoint), {
      authProvider: this.oauthProvider,
      fetch: createTimedFetch(this.config.httpTimeoutMs),
    })
    this.oauthTransport = transport
    return transport
  }

  requestOAuth(): void {
    this.oauthRequested = true
  }

  async cancelPendingAuthorization(): Promise<void> {
    await this.oauthProvider?.closePendingAuthorization()
  }

  async finishAuthorization(transport: StreamableHTTPClientTransport): Promise<boolean> {
    if (this.oauthProvider === undefined || this.oauthTransport !== transport) return false
    const code = await this.oauthProvider.waitForAuthorizationCode()
    await transport.finishAuth(code)
    return true
  }

  async close(): Promise<void> {
    this.oauthTransport = undefined
    this.interactiveOAuthAllowed = false
    await this.oauthProvider?.closePendingAuthorization()
  }
}

export function asTransport(transport: StreamableHTTPClientTransport): Transport {
  return transport as Transport
}
