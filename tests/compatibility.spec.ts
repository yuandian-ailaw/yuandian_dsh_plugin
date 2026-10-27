import { describe, expect, it } from 'vitest'
import { satisfies } from 'semver'
import packageJson from '../package.json' with { type: 'json' }

describe('DSH 安装兼容范围', () => {
  const range = packageJson.engines.dsh

  it.each(['0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1'])(
    '允许同一发布系列 %s（范围匹配不等于运行验证）', (version) => {
      expect(satisfies(version, range, { includePrerelease: true })).toBe(true)
    },
  )

  it.each(['0.2.0', '0.2.1-alpha.5', '0.2.1-rc.1', '0.2.2-alpha.1', '0.2.2', '0.3.0-rc.1'])(
    '拒绝测试基线之前及下一发布系列 %s', (version) => {
      expect(satisfies(version, range, { includePrerelease: true })).toBe(false)
    },
  )

  it('宿主与所有 DSH peer 范围一致，避免安装器回退检查和依赖解析分歧', () => {
    const peers = Object.entries(packageJson.peerDependencies)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    expect(peers.length).toBeGreaterThan(0)
    for (const [, peerRange] of peers) expect(peerRange).toBe(range)
  })
})
