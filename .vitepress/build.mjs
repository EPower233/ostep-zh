import { build } from 'vitepress'

const workers = process.env.BOOK_BUILD_WORKERS
  ? Number(process.env.BOOK_BUILD_WORKERS)
  : process.platform === 'win32' ? 1 : undefined

if (workers !== undefined && (!Number.isInteger(workers) || workers < 1)) {
  throw new Error('BOOK_BUILD_WORKERS must be a positive integer.')
}

await build(process.cwd(), {
  outDir: process.argv[2],
  onAfterConfigResolve(config) {
    if (workers !== undefined) config.buildConcurrency = workers
  },
})
