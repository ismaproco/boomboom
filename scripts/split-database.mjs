import { readFileSync, writeFileSync } from 'node:fs'

const lines = readFileSync('server/database.ts', 'utf8').split('\n')
const slice = (a, b) => lines.slice(a - 1, b).join('\n')

writeFileSync(
  'server/db/popular.ts',
  `import type { Database } from 'bun:sqlite'
import { parseJsonArray } from '../utils'
import type { PopularItem, PopularSnapshot, PopularSnapshotSummary, RankedPopularCluster } from '../types'

${slice(1328, 1375)}

export class PopularDb {
  constructor(readonly db: Database) {}

${slice(163, 227)}

${slice(1002, 1038)}
}
`,
)

writeFileSync(
  'server/db/commodities.ts',
  `import type { Database } from 'bun:sqlite'
import { parseJsonArray } from '../utils'
import type {
  CommodityInstrument,
  CommodityNewsLink,
  CommoditySnapshot,
  CommoditySnapshotSummary,
  CommoditySnapshotItem,
} from '../types'

export class CommodityDb {
  constructor(readonly db: Database) {}

${slice(828, 1000)}
}

export const migrateCommodityDomain = (db: Database) => {
${slice(1207, 1269)}
}
`,
)

const portfolioTail = readFileSync('server/db/portfolio.ts', 'utf8').replace(
  /export const migratePortfolioDomain[\s\S]*$/,
  `export const migratePortfolioDomain = (db: Database) => {
${slice(1040, 1206)}
}`,
)
writeFileSync('server/db/portfolio.ts', portfolioTail)
console.log('done')
