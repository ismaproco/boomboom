import type { MarketSignalsService } from './marketSignalsService'
import type { OptimizedPortfolioService } from './optimizedPortfolioService'
import type { PortfolioScenarioComparisonService } from './portfolioComparison'
import type { PortfolioDecisionService } from './portfolioDecisionService'
import type { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'
import type { PortfolioScenarioSource } from './types'

export class PortfolioCacheCoordinator {
  constructor(
    private readonly portfolioComparison: PortfolioScenarioComparisonService,
    private readonly optimizedPortfolios: OptimizedPortfolioService,
    private readonly portfolioDecisions: PortfolioDecisionService,
    private readonly marketSignals: MarketSignalsService,
    private readonly getScenarioSource: (scenarioId: number) => PortfolioScenarioSource | undefined,
  ) {}

  async warmAll(reason: string) {
    const results = await Promise.allSettled([
      this.portfolioComparison.warmComparison([30, 90, 365]),
      this.portfolioComparison.warmComparison([7, 30, 90, 365], 'optimized'),
      this.optimizedPortfolios.warmSummary(),
      this.portfolioDecisions.warmDecisions('balanced'),
      this.marketSignals.warmSignals(),
    ])
    this.logFailures(reason, results)
  }

  async onOptimizeJobCompleted(scenarioId: number) {
    if (this.getScenarioSource(scenarioId) === 'optimized') {
      await this.warmAll(`optimized job ${scenarioId}`)
      return
    }
    const results = await Promise.allSettled([
      this.portfolioComparison.warmComparison([30, 90, 365]),
      this.portfolioDecisions.warmDecisions('balanced'),
    ])
    this.logFailures(`quant job ${scenarioId}`, results)
  }

  wireOptimizeRunner(runner: PortfolioOptimizeRunner) {
    runner.setCompletionListener((scenarioId) => this.onOptimizeJobCompleted(scenarioId))
  }

  private logFailures(reason: string, results: PromiseSettledResult<unknown>[]) {
    const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[]
    if (failures.length > 0)
      console.error(
        `Portfolio cache warm failed after ${reason}:`,
        failures.map((failure) => failure.reason),
      )
  }
}
