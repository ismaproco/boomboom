import type { NewsStory, RefreshLogEntry } from '../types'
import type { DisplaySectionKeyResolver, PresentationToneLookup, SourceGroupKeyResolver } from './contracts'
import {
  DEFAULT_NEUTRAL_TONE,
  IMPACT_TONE_BY_LEVEL,
  LOG_STATUS_CLASS_BY_STATUS,
  SECTION_TONE_BY_KEY,
  SOURCE_TONE_BY_GROUP,
} from './tokens'

export type ToneLookupDependencies = {
  displaySection: DisplaySectionKeyResolver
  sourceGroup: SourceGroupKeyResolver
}

/**
 * Builds tone class resolvers from injected key resolvers (OCP: new palettes or rules via new deps / token maps, not by editing call sites).
 */
const sectionTones = SECTION_TONE_BY_KEY as Record<string, string>
const sourceTones = SOURCE_TONE_BY_GROUP as Record<string, string>

export const createPresentationToneLookup = (deps: ToneLookupDependencies): PresentationToneLookup => ({
  getSectionTone: (story: NewsStory) => {
    const key = deps.displaySection.sectionKeyForTone(story)
    return sectionTones[key] ?? DEFAULT_NEUTRAL_TONE
  },

  getSourceTone: (source: string) => {
    const group = deps.sourceGroup.sourceGroupForTone(source)
    return sourceTones[group] ?? DEFAULT_NEUTRAL_TONE
  },

  getImpactTone: (impact: NewsStory['impact']) => IMPACT_TONE_BY_LEVEL[impact],

  getLogStatusClass: (status: RefreshLogEntry['status']) => LOG_STATUS_CLASS_BY_STATUS[status],
})
