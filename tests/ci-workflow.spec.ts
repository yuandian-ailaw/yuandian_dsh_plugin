import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Workflow {
  readonly on?: Record<string, unknown>
  readonly permissions?: Record<string, string>
  readonly jobs?: Record<string, {
    readonly strategy?: { readonly matrix?: { readonly include?: Array<Record<string, unknown>> } }
    readonly steps?: Array<{ readonly uses?: string; readonly run?: string; readonly if?: string }>
  }>
}

describe('公开仓库 CI', () => {
  it('在 PR、main 和手动运行中执行跨平台质量门禁', async () => {
    const path = new URL('../.github/workflows/ci.yml', import.meta.url)
    const workflow = parse(await readFile(path, 'utf8')) as Workflow
    expect(workflow.on).toEqual({
      push: { branches: ['main'] },
      pull_request: null,
      workflow_dispatch: null,
    })
    expect(workflow.permissions).toEqual({ contents: 'read' })

    const job = workflow.jobs?.verify
    const matrix = job?.strategy?.matrix?.include ?? []
    expect(matrix.map(value => value.os)).toEqual(expect.arrayContaining(['ubuntu-latest', 'macos-latest', 'windows-latest']))
    expect(matrix.map(value => value.node)).toEqual(expect.arrayContaining(['22.19.0', 24]))
    expect(job?.steps?.some(step => step.run?.includes('pnpm install --frozen-lockfile --ignore-scripts'))).toBe(true)
    expect(job?.steps?.some(step => step.run === 'pnpm check')).toBe(true)
    expect(job?.steps?.some(step => step.run === 'pnpm test:coverage')).toBe(true)
    expect(job?.steps?.some(step => step.run === 'pnpm pack --dry-run')).toBe(true)
    expect(job?.steps?.filter(step => step.uses !== undefined).every(step => /@[0-9a-f]{40}$/.test(step.uses ?? ''))).toBe(true)
  })
})
