import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const outputPath = new URL('../dist/index.mjs', import.meta.url)
const source = await readFile(outputPath, 'utf8')
const clientOutputPath = new URL('../dist/client.js', import.meta.url)
const clientSource = await readFile(clientOutputPath, 'utf8')
const sourceMapPaths = [
  new URL('../dist/index.mjs.map', import.meta.url),
  new URL('../dist/client.js.map', import.meta.url),
]

for (const sourceMapPath of sourceMapPaths) {
  const sourceMap = JSON.parse(await readFile(sourceMapPath, 'utf8'))
  if (!Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
    throw new Error(`source map 缺少源码列表：${sourceMapPath.pathname}`)
  }
  if (sourceMap.sources.some(path => typeof path !== 'string' || path.startsWith('/') || path.includes('/Users/'))) {
    throw new Error(`source map 包含本机绝对路径：${sourceMapPath.pathname}`)
  }
}

const requiredClientMarkers = [
  'window.__ModuleLoader__.load',
  'huayu-yuandian-legal-data',
  '华宇元典法律数据',
  'data:image/svg+xml',
]
for (const marker of requiredClientMarkers) {
  if (!clientSource.includes(marker)) throw new Error(`客户端构建产物缺少：${marker}`)
}
if (!source.includes('sourceMappingURL=index.mjs.map')) throw new Error('服务端构建产物缺少 source map 引用')
if (!clientSource.includes('sourceMappingURL=client.js.map')) throw new Error('客户端构建产物缺少 source map 引用')
const plugin = await import(outputPath.href)
const expectedExports = ['Config', 'apply', 'inject', 'name']
const actualExports = Object.keys(plugin).sort()
if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
  throw new Error(`构建产物导出不符合最小插件契约：${actualExports.join(', ')}`)
}

const require = createRequire(import.meta.url)
const packageJsonPath = require.resolve('huayu-yuandian-legal-data/package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
if (packageJson.exports?.['./client']?.default !== './dist/client.js') {
  throw new Error('插件清单未正确导出 ./client')
}
if (packageJson.exports?.['./package.json'] !== './package.json') {
  throw new Error('插件清单未导出 ./package.json，Harness 无法发现客户端扩展')
}
