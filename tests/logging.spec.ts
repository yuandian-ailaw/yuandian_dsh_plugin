import { describe, expect, it } from 'vitest'
import { safeErrorMessage } from '../src/logging.js'

describe('安全错误日志', () => {
  it('脱敏 Bearer、OAuth URL 参数和常见秘密字段', () => {
    const message = safeErrorMessage(new Error(
      'Authorization: Bearer secret-token https://example.com/callback?code=auth-code&state=csrf-state access_token="access-value" api_key=key-value',
    ))

    expect(message).toContain('Authorization: [REDACTED]')
    expect(message).toContain('code=[REDACTED]')
    expect(message).toContain('state=[REDACTED]')
    expect(message).toContain('access_token=[REDACTED]')
    expect(message).toContain('api_key=[REDACTED]')
    expect(message).not.toContain('secret-token')
    expect(message).not.toContain('auth-code')
    expect(message).not.toContain('csrf-state')
    expect(message).not.toContain('access-value')
    expect(message).not.toContain('key-value')
  })

  it('限制异常文本长度', () => {
    expect(safeErrorMessage('x'.repeat(10_000)).length).toBeLessThanOrEqual(2_001)
  })
})
