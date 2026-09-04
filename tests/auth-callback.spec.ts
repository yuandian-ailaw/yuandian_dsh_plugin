import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { listenForOAuthCallback } from '../src/auth/callback.js'

const openListeners: Array<{ close(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(openListeners.splice(0).map(listener => listener.close()))
})

describe('OAuth loopback 回调', () => {
  it('只接受精确路径、GET、匹配 state 和非空 code', async () => {
    const listener = await listenForOAuthCallback({
      port: 0,
      expectedState: 'expected-state',
      timeoutMs: 2_000,
    })
    openListeners.push(listener)
    const base = `http://127.0.0.1:${listener.port}`

    expect((await fetch(`${base}/wrong`)).status).toBe(404)
    expect((await fetch(`${base}/oauth/callback`, { method: 'POST' })).status).toBe(405)
    const response = await fetch(`${base}/oauth/callback?code=auth-code&state=expected-state`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(listener.code).resolves.toBe('auth-code')
  })

  it('拒绝 state 不匹配和用户拒绝', async () => {
    const mismatch = await listenForOAuthCallback({ port: 0, expectedState: 'right', timeoutMs: 2_000 })
    openListeners.push(mismatch)
    await fetch(`http://127.0.0.1:${mismatch.port}/oauth/callback?code=hidden&state=wrong`)
    await expect(mismatch.code).rejects.toThrow('state 校验失败')

    const denied = await listenForOAuthCallback({ port: 0, expectedState: 'right', timeoutMs: 2_000 })
    openListeners.push(denied)
    await fetch(`http://127.0.0.1:${denied.port}/oauth/callback?error=access_denied&state=right`)
    await expect(denied.code).rejects.toThrow('access_denied')
  })

  it('处理超时、取消和端口占用', async () => {
    const timeout = await listenForOAuthCallback({ port: 0, expectedState: 'state', timeoutMs: 10 })
    openListeners.push(timeout)
    await expect(timeout.code).rejects.toThrow('等待超过')

    const abort = new AbortController()
    const cancelled = await listenForOAuthCallback({
      port: 0,
      expectedState: 'state',
      timeoutMs: 2_000,
      signal: abort.signal,
    })
    openListeners.push(cancelled)
    abort.abort()
    await expect(cancelled.code).rejects.toThrow('已取消')

    const occupied = createServer()
    await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve))
    const address = occupied.address()
    if (address === null || typeof address === 'string') throw new Error('测试端口不可用')
    await expect(listenForOAuthCallback({
      port: address.port,
      expectedState: 'state',
      timeoutMs: 2_000,
    })).rejects.toThrow('已被占用')
    await new Promise<void>(resolve => occupied.close(() => resolve()))
  })
})
