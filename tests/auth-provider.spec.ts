import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { describe, expect, it, vi } from 'vitest'
import type { OAuthCallbackListener, OAuthCallbackOptions } from '../src/auth/callback.js'
import { DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF } from '../src/auth/constants.js'
import { AuthenticationRequiredError } from '../src/auth/errors.js'
import { YuandianOAuthProvider } from '../src/auth/provider.js'
import { resolveApiKey } from '../src/auth/store.js'

class MemoryCredentials {
  readonly values = new Map<string, string>()

  async resolve(ref: CredentialRef): Promise<{ value: string; source: string } | undefined> {
    const value = this.values.get(ref)
    return value === undefined ? undefined : { value, source: 'memory' }
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
  }

  async unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
  }
}

function makeContext(credentials = new MemoryCredentials()): {
  ctx: Context
  credentials: MemoryCredentials
  logger: { debug: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
} {
  const logger = { debug: vi.fn(), warn: vi.fn() }
  return {
    credentials,
    logger,
    ctx: { credentials, logger } as unknown as Context,
  }
}

function fakeCallbackFactory(code = 'callback-code') {
  const options: OAuthCallbackOptions[] = []
  const factory = vi.fn(async (input: OAuthCallbackOptions): Promise<OAuthCallbackListener> => {
    options.push(input)
    return { code: Promise.resolve(code), port: input.port, close: vi.fn(async () => {}) }
  })
  return { factory, options }
}

interface FakeOAuthOptions {
  readonly refreshError?: boolean
}

function fakeOAuthFetch(options: FakeOAuthOptions = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push({ url, ...(init !== undefined ? { init } : {}) })
    const path = new URL(url).pathname
    if (path === '/.well-known/oauth-protected-resource/mcp') {
      return Response.json({
        resource: 'https://mcp.example/mcp',
        authorization_servers: ['https://auth.example'],
        scopes_supported: ['mcp'],
      })
    }
    if (path === '/.well-known/oauth-authorization-server') {
      return Response.json({
        issuer: 'https://auth.example',
        authorization_endpoint: 'https://auth.example/oauth/authorize',
        token_endpoint: 'https://auth.example/oauth/token',
        registration_endpoint: 'https://auth.example/oauth/register',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
      })
    }
    if (path === '/oauth/register') {
      return Response.json({
        client_id: 'dynamic-client',
        redirect_uris: ['http://127.0.0.1:1455/oauth/callback'],
        token_endpoint_auth_method: 'none',
      }, { status: 201 })
    }
    if (path === '/oauth/token') {
      const body = new URLSearchParams(String(init?.body ?? ''))
      if (body.get('grant_type') === 'refresh_token' && options.refreshError === true) {
        return Response.json({ error: 'invalid_grant', error_description: 'expired' }, { status: 400 })
      }
      return Response.json({
        access_token: body.get('grant_type') === 'refresh_token' ? 'refreshed-access' : 'initial-access',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }
    return new Response('not found', { status: 404 })
  })
  return { fetchFn, calls }
}

describe('元典 OAuth provider', () => {
  it('完成 DCR、state、PKCE S256、resource 和授权码换 Token', async () => {
    const { ctx, credentials, logger } = makeContext()
    const callback = fakeCallbackFactory()
    const opener = vi.fn(async (_url: URL) => false)
    const provider = new YuandianOAuthProvider(ctx, {
      credentialRef: 'YUANDIAN_MCP_OAUTH',
      callbackPort: 1455,
      timeoutMs: 300_000,
      openBrowser: true,
      callbackFactory: callback.factory,
      opener,
    })
    const oauth = fakeOAuthFetch()

    await expect(auth(provider, {
      serverUrl: 'https://mcp.example/mcp',
      fetchFn: oauth.fetchFn,
    })).resolves.toBe('REDIRECT')

    const authorizationUrl = opener.mock.calls[0]?.[0] as URL
    expect(authorizationUrl.pathname).toBe('/oauth/authorize')
    expect(authorizationUrl.searchParams.get('state')).toHaveLength(43)
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()
    expect(authorizationUrl.searchParams.get('resource')).toBe('https://mcp.example/mcp')
    expect(callback.options[0]?.expectedState).toBe(authorizationUrl.searchParams.get('state'))
    await expect(provider.waitForAuthorizationCode()).resolves.toBe('callback-code')

    await expect(auth(provider, {
      serverUrl: 'https://mcp.example/mcp',
      authorizationCode: 'authorization-code',
      fetchFn: oauth.fetchFn,
    })).resolves.toBe('AUTHORIZED')

    const persisted = JSON.parse(credentials.values.get('YUANDIAN_MCP_OAUTH') ?? '{}') as Record<string, unknown>
    expect(persisted).toMatchObject({
      version: 1,
      clientInformation: { client_id: 'dynamic-client' },
      tokens: { access_token: 'initial-access', refresh_token: 'refresh-token' },
    })
    expect(persisted).toHaveProperty('codeVerifier')
    expect(persisted).toHaveProperty('discoveryState')
    expect(credentials.values.get(DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF)).toBe('1')
    expect(JSON.stringify(logger)).not.toContain('initial-access')
    expect(logger.warn).toHaveBeenCalledWith(
      '华宇元典法律数据：请在浏览器打开以下授权地址：%s',
      expect.stringContaining('/oauth/authorize'),
    )
  })

  it('自动刷新 Token，refresh 失效时清理 Token 并重新授权', async () => {
    const { ctx } = makeContext()
    const callback = fakeCallbackFactory()
    const provider = new YuandianOAuthProvider(ctx, {
      credentialRef: 'YUANDIAN_MCP_OAUTH',
      callbackPort: 1455,
      timeoutMs: 300_000,
      openBrowser: false,
      callbackFactory: callback.factory,
    })
    await provider.saveClientInformation({ client_id: 'dynamic-client' })
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://auth.example',
      authorizationServerMetadata: {
        issuer: 'https://auth.example',
        authorization_endpoint: 'https://auth.example/oauth/authorize',
        token_endpoint: 'https://auth.example/oauth/token',
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['none'],
      },
      resourceMetadata: { resource: 'https://mcp.example/mcp', scopes_supported: ['mcp'] },
    })
    await provider.saveTokens({
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
    })

    const refresh = fakeOAuthFetch()
    await expect(auth(provider, { serverUrl: 'https://mcp.example/mcp', fetchFn: refresh.fetchFn })).resolves.toBe('AUTHORIZED')
    await expect(provider.tokens()).resolves.toMatchObject({ access_token: 'refreshed-access' })

    const invalid = fakeOAuthFetch({ refreshError: true })
    await expect(auth(provider, { serverUrl: 'https://mcp.example/mcp', fetchFn: invalid.fetchFn })).resolves.toBe('REDIRECT')
    await expect(provider.tokens()).resolves.toBeUndefined()
    expect(callback.factory).toHaveBeenCalledTimes(1)
  })

  it('非用户主动发起时，refresh 失效也不打开 OAuth 授权页', async () => {
    const { ctx, credentials, logger } = makeContext()
    const callback = fakeCallbackFactory()
    const opener = vi.fn(async () => true)
    const provider = new YuandianOAuthProvider(ctx, {
      credentialRef: 'YUANDIAN_MCP_OAUTH',
      callbackPort: 1455,
      timeoutMs: 300_000,
      openBrowser: true,
      callbackFactory: callback.factory,
      opener,
      allowInteractiveAuthorization: () => false,
    })
    await provider.saveClientInformation({ client_id: 'dynamic-client' })
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://auth.example',
      authorizationServerMetadata: {
        issuer: 'https://auth.example',
        authorization_endpoint: 'https://auth.example/oauth/authorize',
        token_endpoint: 'https://auth.example/oauth/token',
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['none'],
      },
      resourceMetadata: { resource: 'https://mcp.example/mcp', scopes_supported: ['mcp'] },
    })
    await provider.saveTokens({
      access_token: 'expired-access',
      refresh_token: 'expired-refresh',
      token_type: 'Bearer',
    })

    await expect(auth(provider, {
      serverUrl: 'https://mcp.example/mcp',
      fetchFn: fakeOAuthFetch({ refreshError: true }).fetchFn,
    })).rejects.toBeInstanceOf(AuthenticationRequiredError)

    expect(callback.factory).not.toHaveBeenCalled()
    expect(opener).not.toHaveBeenCalled()
    expect(credentials.values.has('YUANDIAN_MCP_OAUTH')).toBe(false)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('等待在设置页主动发起'))
  })

  it('支持凭证分区清理且错误不泄露 API Key', async () => {
    const { ctx, credentials } = makeContext()
    const provider = new YuandianOAuthProvider(ctx, {
      credentialRef: 'YUANDIAN_MCP_OAUTH',
      callbackPort: 1455,
      timeoutMs: 300_000,
      openBrowser: false,
      callbackFactory: fakeCallbackFactory().factory,
    })
    await provider.saveTokens({ access_token: 'secret-token', token_type: 'Bearer' })
    expect(credentials.values.get(DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF)).toBe('1')
    await provider.invalidateCredentials('tokens')
    await expect(provider.tokens()).resolves.toBeUndefined()
    expect(credentials.values.has(DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF)).toBe(false)
    await provider.invalidateCredentials('all')
    expect(credentials.values.has('YUANDIAN_MCP_OAUTH')).toBe(false)

    await expect(resolveApiKey(credentials as unknown as CredentialProvider, 'YUANDIAN_API_KEY'))
      .rejects.toThrow('YUANDIAN_API_KEY 未配置')
    credentials.values.set('YUANDIAN_API_KEY', 'highly-secret-key')
    await expect(resolveApiKey(credentials as unknown as CredentialProvider, 'YUANDIAN_API_KEY'))
      .resolves.toBe('highly-secret-key')
  })
})
