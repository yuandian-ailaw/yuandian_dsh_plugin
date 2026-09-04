import { defineConfig } from 'tsdown'

export default defineConfig([{
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: false,
  minify: true,
  sourcemap: true,
  deps: {
    neverBundle: [
      /^@deepseek-ai\/cordis$/,
      /^@deepseek-ai\/dsh-/,
    ],
  },
}, {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  clean: false,
  dts: false,
  minify: true,
  sourcemap: true,
  deps: {
    neverBundle: ['react', 'react/jsx-runtime'],
  },
  loader: { '.svg': 'dataurl' },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "huayu-yuandian-legal-data", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}])
