import { createServer } from 'node:http'
import type { Server } from 'node:http'

const LOOPBACK_HOST = '127.0.0.1'

export class OAuthCallbackError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OAuthCallbackError'
  }
}

export interface OAuthCallbackOptions {
  readonly port: number
  readonly path?: string
  readonly expectedState: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface OAuthCallbackListener {
  readonly code: Promise<string>
  readonly port: number
  close(): Promise<void>
}

function html(title: string, message: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1><p>${message}</p></body></html>`
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise(resolve => server.close(() => resolve()))
}

export async function listenForOAuthCallback(options: OAuthCallbackOptions): Promise<OAuthCallbackListener> {
  const callbackPath = options.path ?? '/oauth/callback'
  let settled = false
  let timer: NodeJS.Timeout | undefined
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`)
    if (url.pathname !== callbackPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found')
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET', 'content-type': 'text/plain; charset=utf-8' }).end('Method Not Allowed')
      return
    }

    const finish = (result: { code: string } | { error: OAuthCallbackError }, status: number, title: string, message: string): void => {
      response.writeHead(status, {
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'content-type': 'text/html; charset=utf-8',
        'cross-origin-opener-policy': 'same-origin',
        pragma: 'no-cache',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      }).end(html(title, message))
      if (settled) return
      settled = true
      if ('code' in result) resolveCode(result.code)
      else rejectCode(result.error)
      void closeServer(server)
    }

    const oauthError = url.searchParams.get('error')
    if (oauthError !== null) {
      finish(
        { error: new OAuthCallbackError(`OAuth 授权未完成：${oauthError}`) },
        400,
        '元典授权未完成',
        '可以关闭此页面并返回 DeepSeek Harness 查看提示。',
      )
      return
    }
    if (url.searchParams.get('state') !== options.expectedState) {
      finish(
        { error: new OAuthCallbackError('OAuth 回调 state 校验失败，请重新发起授权') },
        400,
        '元典授权校验失败',
        '请关闭此页面并重新发起授权。',
      )
      return
    }
    const authorizationCode = url.searchParams.get('code')
    if (authorizationCode === null || authorizationCode === '') {
      finish(
        { error: new OAuthCallbackError('OAuth 回调缺少 authorization code') },
        400,
        '元典授权响应无效',
        '请关闭此页面并重新发起授权。',
      )
      return
    }
    finish(
      { code: authorizationCode },
      200,
      '元典授权成功',
      '可以关闭此页面并返回 DeepSeek Harness。',
    )
  })

  const listening = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, LOOPBACK_HOST, () => {
      server.off('error', reject)
      server.on('error', (error) => {
        if (!settled) {
          settled = true
          rejectCode(new OAuthCallbackError('OAuth 回调监听器异常', { cause: error }))
        }
      })
      resolve()
    })
  })

  try {
    await listening
  } catch (error) {
    const codeValue = (error as NodeJS.ErrnoException).code
    if (codeValue === 'EADDRINUSE') {
      throw new OAuthCallbackError(`OAuth 回调端口 ${options.port} 已被占用，请修改 auth.callbackPort 后重试`, { cause: error })
    }
    throw new OAuthCallbackError(`无法在 ${LOOPBACK_HOST}:${options.port} 启动 OAuth 回调监听器`, { cause: error })
  }

  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeServer(server)
    throw new OAuthCallbackError('无法确定 OAuth 回调监听端口')
  }

  const fail = (error: OAuthCallbackError): void => {
    if (settled) return
    settled = true
    rejectCode(error)
    void closeServer(server)
  }
  timer = setTimeout(() => {
    fail(new OAuthCallbackError(`OAuth 授权等待超过 ${options.timeoutMs}ms，请重新发起授权`))
  }, options.timeoutMs)
  timer.unref()
  const onAbort = (): void => fail(new OAuthCallbackError('OAuth 授权已取消'))
  options.signal?.addEventListener('abort', onAbort, { once: true })

  void code.finally(() => {
    if (timer !== undefined) clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }).catch(() => {})

  return {
    code,
    port: address.port,
    async close(): Promise<void> {
      if (!settled) {
        settled = true
        rejectCode(new OAuthCallbackError('OAuth 授权监听器已关闭'))
      }
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      await closeServer(server)
    },
  }
}
