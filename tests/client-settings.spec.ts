import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  DEFAULT_OAUTH_START_CREDENTIAL_REF,
} from '../src/auth/constants.js'
import {
  cancelOAuthAuthorization,
  oauthAuthorizationView,
  oauthCancellationAvailability,
} from '../src/client/authentication.js'
import {
  CLIENT_PLUGIN_VERSION,
  DISPLAY_NAME,
  LEGAL_CAPABILITIES,
  RESOURCE_GROUPS,
  YuandianSettingsSection,
  apply,
  describeAuthentication,
  inject,
  requestOAuthStart,
} from '../src/client/index.js'

describe('华宇元典法律数据设置区块', () => {
  it('取消 OAuth 时清除凭据、授权完成标记和进行中尝试', async () => {
    const unset = vi.fn(async (_input: string) => ({ ok: true, value: undefined }))

    await cancelOAuthAuthorization({ credentials: { unset } } as never)

    expect(unset.mock.calls.map(([input]) => input)).toEqual([
      DEFAULT_OAUTH_CREDENTIAL_REF,
      DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
      DEFAULT_OAUTH_START_CREDENTIAL_REF,
    ])
  })

  it('取消 OAuth 失败时向界面保留凭据服务错误', async () => {
    const unset = vi.fn(async () => ({
      ok: false, error: { message: '凭据来自只读来源' },
    }))

    await expect(cancelOAuthAuthorization({ credentials: { unset } } as never))
      .rejects.toThrow('凭据来自只读来源')
  })

  it('只在已授权状态显示取消操作，并识别只读来源', () => {
    expect(oauthCancellationAvailability({ configured: false, writable: true })).toBe('hidden')
    expect(oauthCancellationAvailability({ configured: true, writable: true })).toBe('enabled')
    expect(oauthCancellationAvailability({ configured: true, writable: false })).toBe('readonly')
  })

  it('不把 OAuth discovery 或 PKCE 中间状态误判为已授权', () => {
    expect(oauthAuthorizationView(
      { configured: true, writable: true, source: 'file' },
      { configured: false, writable: true },
    )).toEqual({ configured: false, writable: true })

    expect(oauthAuthorizationView(
      { configured: true, writable: true, source: 'file' },
      { configured: true, writable: true, source: 'file' },
    )).toEqual({ configured: true, writable: true, source: 'file' })
  })

  it('只在用户操作时写入 OAuth 启动信号', async () => {
    const set = vi.fn(async () => ({ ok: true, value: undefined }))

    await requestOAuthStart({ credentials: { set } } as never)

    expect(set).toHaveBeenCalledWith(DEFAULT_OAUTH_START_CREDENTIAL_REF, expect.stringMatching(/^\d+-\d+$/))
  })

  it('通过新版 Remote 读取凭据映射，区分授权完成与进行中状态', async () => {
    const describe = vi.fn(async () => ({ ok: true, value: {
      [DEFAULT_OAUTH_CREDENTIAL_REF]: { configured: true, writable: true },
      [DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF]: { configured: true, writable: true },
      [DEFAULT_OAUTH_START_CREDENTIAL_REF]: { configured: true, writable: true },
    } }))
    const state = await describeAuthentication({ credentials: { describe } } as never)
    expect(describe).toHaveBeenCalledWith([
      DEFAULT_OAUTH_CREDENTIAL_REF,
      DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
      DEFAULT_OAUTH_START_CREDENTIAL_REF,
      'YUANDIAN_API_KEY',
    ])
    expect(state).toEqual({
      loading: false,
      oauth: { configured: true, writable: true },
      oauthPending: true,
      apiKey: { configured: false, writable: true },
    })
  })

  it('Remote 读取和发起授权失败时保留诊断信息', async () => {
    const failure = { ok: false, error: { message: '凭据服务暂不可用' } }
    const api = { credentials: {
      describe: vi.fn(async () => failure),
      set: vi.fn(async () => failure),
    } }
    await expect(describeAuthentication(api as never)).rejects.toThrow('凭据服务暂不可用')
    await expect(requestOAuthStart(api as never)).rejects.toThrow('凭据服务暂不可用')
  })

  it('以中文名称注册设置页入口', () => {
    let slotName: string | undefined
    let effect: { callback: unknown, name: string } | undefined
    let registration: { options: Record<string, unknown>, component: unknown } | undefined
    const ctx = {
      remote: { credentials: {} },
      effect(callback: unknown, name: string) {
        effect = { callback, name }
      },
      slots: {
        inject(name: string, callback: () => void) {
          slotName = name
          callback()
        },
        register(options: Record<string, unknown>, component: unknown) {
          registration = { options, component }
          return () => undefined
        },
      },
    }

    apply(ctx as never)

    if (registration === undefined) throw new Error('设置页未注册')
    const rendered = (registration.component as () => { props: { api: unknown } })()
    expect(rendered.props.api).toBe(ctx.remote)
    expect(inject).toEqual(['slots', 'remote', 'remote.credentials'])
    expect(effect).toEqual({
      callback: expect.any(Function),
      name: 'yuandian: settings navigation icon',
    })
    expect(slotName).toBe('settings.section')
    expect(registration).toEqual({
      options: {
        name: 'settings.section',
        id: 'yuandian-legal-data',
        order: 30,
        label: DISPLAY_NAME,
      },
      component: expect.any(Function),
    })
  })

  it('渲染中文名称、真实 logo 和版本信息', () => {
    const markup = renderToStaticMarkup(createElement(YuandianSettingsSection))

    expect(markup).toContain(`>${DISPLAY_NAME}</h2>`)
    expect(markup).toContain('alt="华宇元典法律数据 Logo"')
    expect(markup).toMatch(/<img[^>]+src="[^"]+logo\.svg"/)
    expect(markup).toContain(`插件版本 ${CLIENT_PLUGIN_VERSION}`)
    expect(markup).toContain('认证配置')
    expect(markup).toContain('未认证')
  })

  it('渲染完整的元典产品与生态入口', () => {
    const markup = renderToStaticMarkup(createElement(YuandianSettingsSection))
    const links: Array<{ label: string, href: string }> = []
    for (const group of RESOURCE_GROUPS) links.push(...group.links)

    expect(markup).not.toContain('YUANDIAN OPEN PLATFORM')
    expect(markup).not.toContain('智能体的法律加速器')
    expect(markup).not.toContain('可信、可组合的法律能力')
    expect(markup).toContain('产品功能')
    expect(markup).toContain('公司')
    expect(markup).toContain('元典生态')
    expect(links).toHaveLength(10)
    for (const link of links) {
      expect(markup).toContain(`href="${link.href}"`)
      expect(markup).toContain(`>${link.label}</span>`)
    }
    expect(markup.match(/target="_blank"/g)).toHaveLength(10)
    expect(markup.match(/rel="noreferrer"/g)).toHaveLength(10)
    expect(markup.match(/data-yuandian-resource-link=""/g)).toHaveLength(10)
    for (const capability of LEGAL_CAPABILITIES) expect(markup).toContain(`>${capability}</span>`)
  })

  it('将插件版本放在资源区之后并右对齐', () => {
    const markup = renderToStaticMarkup(createElement(YuandianSettingsSection))
    const resourceIndex = markup.indexOf('aria-label="元典产品与生态入口"')
    const versionIndex = markup.indexOf(`插件版本 ${CLIENT_PLUGIN_VERSION}`)

    expect(resourceIndex).toBeGreaterThan(-1)
    expect(versionIndex).toBeGreaterThan(resourceIndex)
    expect(markup).toContain('align-self:flex-end')
  })

  it('资源区外层不设置背景颜色或渐变', () => {
    const markup = renderToStaticMarkup(createElement(YuandianSettingsSection))
    const resourceStart = markup.indexOf('aria-label="元典产品与生态入口"')
    const resourceEnd = markup.indexOf('aria-label="法律数据能力"')
    const resourceOpeningTag = markup.slice(resourceStart, resourceEnd)

    expect(resourceOpeningTag).not.toContain('background-color')
    expect(resourceOpeningTag).not.toContain('background-image')
  })
})
