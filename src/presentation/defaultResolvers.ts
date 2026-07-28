import { inferDisplaySection, getSourceGroup } from '../storyRules'
import type { DisplaySectionKeyResolver, SourceGroupKeyResolver } from './contracts'

/** Default wiring: uses production story classification from `storyRules`. */
export const defaultDisplaySectionKeyResolver: DisplaySectionKeyResolver = {
  sectionKeyForTone: (story) => inferDisplaySection(story).toLowerCase(),
}

export const defaultSourceGroupKeyResolver: SourceGroupKeyResolver = {
  sourceGroupForTone: (source) => getSourceGroup(source),
}
