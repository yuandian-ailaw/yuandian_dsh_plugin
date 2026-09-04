import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'

const paths = process.argv.slice(2)
if (paths.length !== 1) throw new Error('必须提供且只提供一个 .tgz 路径')

const [artifactPath] = paths
if (artifactPath === undefined || !artifactPath.endsWith('.tgz')) {
  throw new Error('制品路径必须以 .tgz 结尾')
}

const hash = createHash('sha256')
for await (const chunk of createReadStream(artifactPath)) hash.update(chunk)

const checksumPath = `${artifactPath}.sha256`
await writeFile(checksumPath, `${hash.digest('hex')}  ${basename(artifactPath)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
})
