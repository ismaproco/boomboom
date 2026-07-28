import type { NewsStory, RefreshLogEntry } from '../types'

/** Story fields needed to derive a display-section key for tone lookup (matches inferDisplaySection input). */
export type StoryToneInput = Pick<NewsStory, 'section' | 'headline' | 'summary' | 'source'>

/**
 * Resolves which visual bucket a story belongs in for section-tone styling.
 * DIP: presentation styling depends on this abstraction, not on concrete classification rules.
 */
export interface DisplaySectionKeyResolver {
  sectionKeyForTone(story: StoryToneInput): string
}

/**
 * Resolves a coarse source group label for source-tone styling.
 * DIP: tone lookup does not import source-classification heuristics directly.
 */
export interface SourceGroupKeyResolver {
  sourceGroupForTone(source: string): string
}

/** Lookup API produced by the tone factory — stable surface for tests and extension. */
export interface PresentationToneLookup {
  getSectionTone(story: NewsStory): string
  getSourceTone(source: string): string
  getImpactTone(impact: NewsStory['impact']): string
  getLogStatusClass(status: RefreshLogEntry['status']): string
}
