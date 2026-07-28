import { createPresentationToneLookup, type ToneLookupDependencies } from './toneLookup'
import { defaultDisplaySectionKeyResolver, defaultSourceGroupKeyResolver } from './defaultResolvers'

export type {
  DisplaySectionKeyResolver,
  PresentationToneLookup,
  SourceGroupKeyResolver,
  StoryToneInput,
} from './contracts'
export { createPresentationToneLookup, type ToneLookupDependencies }
export { defaultDisplaySectionKeyResolver, defaultSourceGroupKeyResolver } from './defaultResolvers'
export {
  DEFAULT_NEUTRAL_TONE,
  IMPACT_TONE_BY_LEVEL,
  LOG_STATUS_CLASS_BY_STATUS,
  SECTION_TONE_BY_KEY,
  SOURCE_TONE_BY_GROUP,
} from './tokens'

export {
  LogMetric,
  SectionHeader,
  ShortcutRow,
  StoryLabel,
  TopMenuButton,
} from './components'

const defaultToneLookup = createPresentationToneLookup({
  displaySection: defaultDisplaySectionKeyResolver,
  sourceGroup: defaultSourceGroupKeyResolver,
})

export const getSectionTone = defaultToneLookup.getSectionTone
export const getSourceTone = defaultToneLookup.getSourceTone
export const getImpactTone = defaultToneLookup.getImpactTone
export const getLogStatusClass = defaultToneLookup.getLogStatusClass
