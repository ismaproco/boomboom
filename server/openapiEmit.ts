import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { swagger } from '@elysiajs/swagger'
import { buildRuntime, createApp } from './appFactory'

const emitDir = mkdtempSync(join(tmpdir(), 'boomboom-openapi-'))
process.env.DATA_DIR = emitDir
process.env.SQLITE_PATH = join(emitDir, 'openapi.sqlite')

const runtime = buildRuntime()
const app = createApp(runtime).use(
  swagger({
    path: '/swagger',
    documentation: {
      info: { title: 'BoomBoom News API', version: '0.1.0' },
    },
  }),
)

const server = app.listen({ hostname: '127.0.0.1', port: 0 })
const port = server.server?.port
if (!port) throw new Error('Failed to start OpenAPI emit server')

try {
  const response = await fetch(`http://127.0.0.1:${port}/swagger/json`)
  if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`)
  const spec = await response.json()
  const outPath = join(process.cwd(), 'openapi.json')
  writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`)
  console.log(`Wrote ${outPath}`)
} finally {
  server.stop()
  runtime.store.close()
}
