#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const lines = readFileSync(join(root, 'src/dashboards/portfolio/portfolioCharts.tsx'), 'utf8').split('\n')

const header = `import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { newsApi } from '../../api'
import { formatArchiveTime, formatTerminalTime } from '../../formatters'
import { getRankMoveClass, getSourceGroup, inferDisplaySection } from '../../storyRules'
import type {
  ArticleRecordsResponse,
  CommoditiesResponse,
  CommodityHistoryResponse,
  MarketSignalItem,
  MarketSignalsResponse,
  NewsStory,
  OptimizedPortfoliosResponse,
  PopularItem,
  PopularResponse,
  PopularSnapshotSummary,
  PortfolioBracketParticipant,
  PortfolioBracketRankScope,
  PortfolioBracketResponse,
  PortfolioBracketSource,
  PortfolioComparisonResponse,
  PortfolioDecisionProfile,
  PortfolioDecisionResponse,
  PortfolioHistoryResponse,
  PortfolioOptimizeJob,
  PortfolioResponse,
  PortfolioScenario,
  PortfolioScenarioInput,
  PortfolioSignalCalibrationResponse,
  QuantMethod,
  QuantUniversePolicy,
  RefreshLogResponse,
  Sp500OptimizePayload,
  TickerWatchlistResponse,
} from '../../types'
import { getImpactTone, getLogStatusClass, getSectionTone, getSourceTone, LogMetric, SectionHeader, StoryLabel } from '../../presentation'
import { formatPct, formatMoney, formatNullablePct, getChangeClass } from '../formatters'
`

const shared = lines.slice(1655).join('\n')
writeFileSync(join(root, 'src/dashboards/portfolio/shared.tsx'), `${header}\n${shared}\n`)

const blocks = [
  { file: 'optimized.tsx', start: 37, end: 390 },
  { file: 'portfolio.tsx', start: 391, end: 1186 },
  { file: 'decisions.tsx', start: 1187, end: 1373 },
  { file: 'playoffs.tsx', start: 1374, end: 1654 },
]

for (const { file, start, end } of blocks) {
  const body = lines.slice(start - 1, end).join('\n')
  writeFileSync(
    join(root, `src/dashboards/portfolio/${file}`),
    `${header}\nimport { formatPct, formatMoney, formatNullablePct, getChangeClass } from './shared'\n\n${body}\n`,
  )
}

writeFileSync(
  join(root, 'src/dashboards/portfolio/index.ts'),
  `export { OptimizedPortfolioDashboard } from './optimized'
export { PortfolioDashboard } from './portfolio'
export { PortfolioDecisionDashboard } from './decisions'
export { PortfolioPlayoffsDashboard } from './playoffs'
`,
)

writeFileSync(join(root, 'src/dashboards/portfolio/portfolioCharts.tsx'), `export {
  OptimizedPortfolioDashboard,
  PortfolioDashboard,
  PortfolioDecisionDashboard,
  PortfolioPlayoffsDashboard,
} from './index'
`)

console.log('Split portfolio charts')
