import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type BuildOptions, context } from 'esbuild'
import packageJSON from '../package.json'

rmSync('dist', { force: true, recursive: true })

const serverOptions: BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  external: [
    ...Object.keys(packageJSON.dependencies),
    ...Object.keys(packageJSON.peerDependencies),
    ...Object.keys(packageJSON.optionalDependencies),
    ...Object.keys(packageJSON.devDependencies),
  ],
}
const clientOptions: BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'safari14',
  format: 'esm',
  sourcemap: true,
}

const watch = async (options: BuildOptions) => {
  const ctx = await context(options)
  await ctx.watch()
}

void watch({
  entryPoints: ['src/client/client.ts'],
  outfile: 'dist/client/client.mjs',
  external: ['@vite/env'],
  ...clientOptions,
})
void watch({
  entryPoints: ['src/client/env.ts'],
  outfile: 'dist/client/env.mjs',
  ...clientOptions,
})
void watch({
  ...serverOptions,
  entryPoints: ['./src/node/publicUtils.ts'],
  outfile: 'dist/node-cjs/publicUtils.cjs',
  format: 'cjs',
  banner: {
    js: `
const { pathToFileURL } = require("node:url")
const __url = pathToFileURL(__filename)`.trimStart(),
  },
  define: {
    'import.meta.url': '__url',
  },
})
void watch({
  ...serverOptions,
  entryPoints: ['./src/runtime/index.ts'],
  outfile: 'dist/node/runtime.js',
  format: 'esm',
})
void watch({
  ...serverOptions,
  entryPoints: {
    cli: 'src/node/cli.ts',
    constants: 'src/node/constants.ts',
    index: 'src/node/index.ts',
  },
  outdir: 'dist/node',
  format: 'esm',
  // The current usage of require() inside inlined workers confuse esbuild,
  // and generate top level __require which are then undefined in the worker
  // at runtime. To workaround, we move require call to ___require and then
  // back to require on build end.
  // Ideally we should move workers to ESM
  define: { require: '___require' },
  plugins: [
    {
      name: 'log',
      setup(build) {
        build.onEnd(() => {
          for (const file of ['index.js', 'cli.js']) {
            const path = `dist/node/${file}`
            writeFileSync(
              path,
              readFileSync(path, 'utf-8').replaceAll('___require', 'require'),
            )
          }
          console.log('JS ready')
        })
      },
    },
  ],
})
