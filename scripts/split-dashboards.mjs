#!/usr/bin/env bun
/**
 * One-off splitter: extracts dashboard components from src/dashboards.tsx
 * into domain folders. Run once when restructuring; safe to re-run after edits.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const src = readFileSync(join(root, 'src/dashboards.tsx'), 'utf8')
const lines = src.split('\n')

const blocks = [
  { file: 'src/dashboards/markets/marketSignals.tsx', start: 38, end: 163, imports: `import { useState } from 'react'\nimport type { MarketSignalItem, MarketSignalsResponse } from '../../types'\nimport { getImpactTone, getSectionTone, getSourceTone, SectionHeader, StoryLabel } from '../../presentation'\nimport { formatSignalCategory, getSignalCategoryClass } from '../marketHelpers'\n` },
  { file: 'src/dashboards/feed/popular.tsx', start: 164, end: 361, imports: `import { useEffect, useState } from 'react'\nimport { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'\nimport type { PopularItem, PopularResponse, PopularSnapshotSummary } from '../../types'\nimport { formatArchiveTime, formatTerminalTime } from '../../formatters'\nimport { getRankMoveClass } from '../../storyRules'\nimport { getImpactTone, getSectionTone, getSourceTone, SectionHeader, StoryLabel } from '../../presentation'\nimport { formatRankMove, formatSignedCount, getDeltaChipClass, getDeltaTextClass, PopularMetric, PopularSnapshotSignal } from '../marketHelpers'\n` },
  { file: 'src/dashboards/markets/tickers.tsx', start: 362, end: 463, imports: `import type { TickerWatchlistResponse } from '../../types'\nimport { formatTerminalTime } from '../../formatters'\nimport { SectionHeader } from '../../presentation'\nimport { formatMoney, formatNullablePct, getChangeClass } from '../formatters'\nimport { TickerWeekSparkline, WatchlistScoreButton, WatchlistSummaryCard } from '../marketHelpers'\n` },
  { file: 'src/dashboards/markets/commodities.tsx', start: 464, end: 613, imports: `import { useEffect, useState } from 'react'\nimport { newsApi } from '../../api'\nimport type { CommoditiesResponse, CommodityHistoryResponse } from '../../types'\nimport { formatTerminalTime } from '../../formatters'\nimport { getImpactTone, getSectionTone, getSourceTone, SectionHeader, StoryLabel } from '../../presentation'\nimport { formatMoney, formatNullablePct, getChangeClass } from '../formatters'\nimport { CommoditySparkline } from '../marketHelpers'\n` },
  { file: 'src/dashboards/feed/dataCenters.tsx', start: 714, end: 790, imports: `import type { NewsStory } from '../../types'\nimport { formatTerminalTime } from '../../formatters'\nimport { getImpactTone, getSectionTone, getSourceTone, SectionHeader, StoryLabel } from '../../presentation'\n` },
  { file: 'src/dashboards/feed/articles.tsx', start: 791, end: 863, imports: `import type { ArticleRecordsResponse } from '../../types'\nimport { formatArchiveTime, formatTerminalTime } from '../../formatters'\nimport { getImpactTone, getSectionTone, getSourceTone, SectionHeader } from '../../presentation'\n` },
  { file: 'src/dashboards/feed/refreshLog.tsx', start: 865, end: 969, imports: `import type { RefreshLogResponse } from '../../types'\nimport { formatTerminalTime } from '../../formatters'\nimport { getLogStatusClass, LogMetric, SectionHeader } from '../../presentation'\n` },
]

const helperBlock = lines.slice(613, 713).join('\n')
const helperImports = `import type { MarketSignalItem, PopularItem, PopularSnapshotSummary } from '../types'\nimport { getRankMoveClass } from '../storyRules'\nimport { formatPct } from './formatters'\n\nexport { formatPct, formatMoney, formatNullablePct, getChangeClass } from './formatters'\n\n`
writeFileSync(join(root, 'src/dashboards/formatters.ts'), `export const formatPct = (value: number) => \`\${(value * 100).toFixed(2)}%\`\nexport const formatMoney = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })\nexport const formatNullablePct = (value: number | null) => (value === null ? '—' : formatPct(value))\nexport const getChangeClass = (value: number | null) => (value === null ? 'text-slate-400' : value >= 0 ? 'text-emerald-300' : 'text-rose-300')\n`)
writeFileSync(join(root, 'src/dashboards/marketHelpers.tsx'), helperImports + helperBlock.replace(/^const formatPct.*\nconst formatMoney.*\nconst formatNullablePct.*\nconst getChangeClass.*\n\n/m, ''))

for (const { file, start, end, imports } of blocks) {
  const body = lines.slice(start - 1, end).join('\n')
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), `${imports}\n${body}\n`)
}

writeFileSync(join(root, 'src/dashboards/index.ts'), `export { MarketSignalsSummary } from './markets/marketSignals'
export { TickerWatchlistDashboard } from './markets/tickers'
export { CommoditiesDashboard } from './markets/commodities'
export { PopularDashboard } from './feed/popular'
export { DataCentersDashboard } from './feed/dataCenters'
export { RawArticlesTable } from './feed/articles'
export { RefreshLogDashboard } from './feed/refreshLog'
`)

writeFileSync(join(root, 'src/dashboards.tsx'), `export {
  MarketSignalsSummary,
  TickerWatchlistDashboard,
  CommoditiesDashboard,
  PopularDashboard,
  DataCentersDashboard,
  RawArticlesTable,
  RefreshLogDashboard,
} from './dashboards/index'
`)

console.log('Split dashboards into src/dashboards/{feed,markets}/')
