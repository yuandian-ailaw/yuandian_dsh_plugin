import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/artifact-checksum.mjs', import.meta.url))

describe('制品摘要', () => {
  it('为唯一 tgz 生成可复核的 SHA-256 清单', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yuandian-checksum-'))
    try {
      const artifact = join(directory, 'plugin.tgz')
      const content = Buffer.from('deterministic-test-artifact')
      await writeFile(artifact, content)
      await run(process.execPath, [script, artifact])

      const expected = createHash('sha256').update(content).digest('hex')
      await expect(readFile(`${artifact}.sha256`, 'utf8'))
        .resolves.toBe(`${expected}  plugin.tgz\n`)
      await expect(run(process.execPath, [script, artifact])).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
