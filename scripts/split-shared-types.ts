import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const src = readFileSync(join(root, 'shared/types.ts'), 'utf8')
const lines = src.split('\n')

const healthStart = lines.findIndex((line) => line.startsWith('export type SchedulerTaskStatus'))
if (healthStart < 0) throw new Error('health block not found')

const commonBlock = `export type Impact = 'High' | 'Medium' | 'Low'
export type SourceState = 'live' | 'stale' | 'fallback'
export type NoveltyProfile = 'low' | 'medium' | 'high'
`

const healthBlock = lines.slice(healthStart).join('\n')
const coreBlock = lines
  .slice(0, healthStart)
  .join('\n')
  .replace(`${commonBlock.trim()}\n\n`, '')

mkdirSync(join(root, 'shared/types'), { recursive: true })
writeFileSync(join(root, 'shared/types/common.ts'), commonBlock)
writeFileSync(
  join(root, 'shared/types/core.ts'),
  `import type { NoveltyProfile, SourceState } from './common'\n\n${coreBlock}`,
)
writeFileSync(
  join(root, 'shared/types/health.ts'),
  `import type { QuantMethod, QuantUniversePolicy, TopNewsResponse } from './core'\n\n${healthBlock}`,
)
writeFileSync(join(root, 'shared/types/index.ts'), "export * from './common'\nexport * from './core'\nexport * from './health'\n")
writeFileSync(join(root, 'shared/types.ts'), "export * from './types/index'\n")

console.log('Split shared/types.ts into shared/types/{common,core,health}.ts')
