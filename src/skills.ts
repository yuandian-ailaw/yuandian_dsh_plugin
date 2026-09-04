import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import { parse } from 'yaml'

const SKILL_NAMES = Object.freeze([
  'prc-legal-research-law-search',
  'prc-legal-research-case-search',
  'prc-legal-research-company-search',
  'prc-legal-research-securities-compliance',
] as const)

const DEFAULT_SKILLS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

export type BundledSkillName = (typeof SKILL_NAMES)[number]

export interface LoadedBundledSkill extends SkillRegistration {
  readonly name: BundledSkillName
  readonly path: string
}

export function parseBundledSkill(raw: string, path: string): LoadedBundledSkill {
  const normalized = raw.replaceAll('\r\n', '\n')
  const match = FRONTMATTER_PATTERN.exec(normalized)
  if (match === null) throw new Error(`Skill 缺少 YAML frontmatter：${path}`)

  const metadata = parse(match[1] ?? '') as unknown
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new Error(`Skill frontmatter 必须是对象：${path}`)
  }
  const fields = metadata as Record<string, unknown>
  const name = fields.name
  const description = fields.description
  const whenToUse = fields.whenToUse
  if (typeof name !== 'string' || !SKILL_NAMES.includes(name as BundledSkillName)) {
    throw new Error(`Skill 名称不受支持：${String(name)}`)
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error(`Skill 缺少 description：${path}`)
  }
  if (whenToUse !== undefined && typeof whenToUse !== 'string') {
    throw new Error(`Skill whenToUse 必须是字符串：${path}`)
  }
  const content = (match[2] ?? '').trim()
  if (content === '') throw new Error(`Skill 正文为空：${path}`)

  return {
    name: name as BundledSkillName,
    description: description.trim(),
    ...(typeof whenToUse === 'string' ? { whenToUse: whenToUse.trim() } : {}),
    content,
    path,
    source: 'bundled',
    provider: 'huayu-yuandian-legal-data',
    resourceBase: { kind: 'directory', path: dirname(path) },
    metadata: fields,
  }
}

export async function loadBundledSkills(root = DEFAULT_SKILLS_ROOT): Promise<readonly LoadedBundledSkill[]> {
  return Promise.all(SKILL_NAMES.map(async (name) => {
    const path = join(root, name, 'SKILL.md')
    return parseBundledSkill(await readFile(path, 'utf8'), path)
  }))
}

export async function registerBundledSkills(ctx: Context, root = DEFAULT_SKILLS_ROOT): Promise<void> {
  const skills = await loadBundledSkills(root)
  ctx.effect(() => {
    const disposers = skills.map(skill => ctx.skills.register(skill))
    ctx.logger.debug('华宇元典法律数据：已注册 %d 个官方 Skill', skills.length)
    return () => {
      for (const dispose of disposers.reverse()) dispose()
      ctx.logger.debug('华宇元典法律数据：已注销官方 Skill')
    }
  }, 'yuandian.skills')
}

export { SKILL_NAMES }
