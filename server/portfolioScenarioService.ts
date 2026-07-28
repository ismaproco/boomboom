import { apiError, type ApiErrorBody } from './errors'
import { parsePositiveIntParam, parseScenarioCreateBody, parseScenarioIdQuery, parseScenarioPatchBody } from './requestParams'
import type { AutoPortfolioService } from './portfolio'
import type { PortfolioScenario, PortfolioScenarioInput } from './types'

type ScenarioRouteBody = PortfolioScenario | { id: number } | { ok: true } | ApiErrorBody

type ScenarioStore = {
  getPortfolioScenario(scenarioId: number): PortfolioScenario | null
  insertPortfolioScenario(input: PortfolioScenarioInput & { isDefault?: boolean }): number
  updatePortfolioScenario(scenarioId: number, input: Partial<PortfolioScenarioInput>): void
  deletePortfolioScenario(scenarioId: number): void
}

export class PortfolioScenarioService {
  constructor(
    private readonly store: ScenarioStore,
    private readonly portfolios: Pick<AutoPortfolioService, 'resolveDefaultScenarioId'>,
  ) {}

  resolveScenarioId(query: Record<string, string | undefined>): number | null {
    const requested = parseScenarioIdQuery(query.scenarioId)
    if (requested !== null) {
      return this.store.getPortfolioScenario(requested) ? requested : null
    }
    return this.portfolios.resolveDefaultScenarioId()
  }

  create(body: unknown): { status: 200 | 400; body: ScenarioRouteBody } {
    const parsed = parseScenarioCreateBody(body as Record<string, unknown>)
    if (!parsed) {
      return {
        status: 400,
        body: apiError(
          'validation_error',
          'Invalid scenario: require name, symbols[], noveltyProfile (low|medium|high), optional maxWeightPerAsset (0.05–0.5).',
        ),
      }
    }
    const id = this.store.insertPortfolioScenario(parsed)
    const scenario = this.store.getPortfolioScenario(id)
    return { status: 200, body: scenario ?? { id } }
  }

  update(idRaw: string, body: unknown): { status: 200 | 400 | 404; body: ScenarioRouteBody } {
    const id = parsePositiveIntParam(idRaw)
    if (!id) {
      return { status: 400, body: apiError('validation_error', 'Invalid scenario id') }
    }
    const existing = this.store.getPortfolioScenario(id)
    if (!existing) {
      return { status: 404, body: apiError('not_found', 'Scenario not found') }
    }
    const patch = parseScenarioPatchBody(body as Record<string, unknown>)
    if (!patch || Object.keys(patch).length === 0) {
      return { status: 400, body: apiError('validation_error', 'No valid fields to update') }
    }
    this.store.updatePortfolioScenario(id, patch)
    return { status: 200, body: this.store.getPortfolioScenario(id) ?? { id } }
  }

  delete(idRaw: string): { status: 200 | 400 | 404; body: ScenarioRouteBody } {
    const id = parsePositiveIntParam(idRaw)
    if (!id) {
      return { status: 400, body: apiError('validation_error', 'Invalid scenario id') }
    }
    const existing = this.store.getPortfolioScenario(id)
    if (!existing) {
      return { status: 404, body: apiError('not_found', 'Scenario not found') }
    }
    if (existing.isDefault) {
      return { status: 400, body: apiError('validation_error', 'Cannot delete the default scenario') }
    }
    this.store.deletePortfolioScenario(id)
    return { status: 200, body: { ok: true } }
  }
}
