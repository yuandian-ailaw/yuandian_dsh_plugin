import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { loadBundledSkills, registerBundledSkills, SKILL_NAMES } from '../src/skills.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('元典官方 Skill', () => {
  it('4 个 frontmatter 均可解析且包含 DSH 工具名说明', async () => {
    const skills = await loadBundledSkills(join(projectRoot, 'skills'))

    expect(skills.map(skill => skill.name)).toEqual(SKILL_NAMES)
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(20)
      expect(skill.whenToUse).toContain('MCP')
      expect(skill.content).toContain('mcp__yuandian__yuandian_*')
      expect(skill.content).toContain('# 中国')
    }
  })

  it('记录 4 个上游 ZIP 的路径、哈希和同步日期', async () => {
    const raw = await readFile(join(projectRoot, 'skills', 'upstream.json'), 'utf8')
    const upstream = JSON.parse(raw) as { syncedAt: string; skills: Array<{ sha256: string }> }

    expect(upstream.syncedAt).toBe('2026-08-13')
    expect(upstream.skills).toHaveLength(4)
    expect(upstream.skills.every(item => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true)
  })

  it('运行时注册并在插件卸载时注销全部 Skill', async () => {
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    let cleanup: (() => void) | undefined
    const ctx = {
      skills: { register },
      logger: { debug: vi.fn() },
      effect: (factory: () => () => void) => {
        cleanup = factory()
        return cleanup
      },
    } as unknown as Context

    await registerBundledSkills(ctx, join(projectRoot, 'skills'))
    expect(register).toHaveBeenCalledTimes(4)

    cleanup?.()
    expect(dispose).toHaveBeenCalledTimes(4)
  })
})
