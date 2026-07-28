import type { ActiveMenu } from '../navigation'

const EYEBROW_TRACKING = 'text-xs font-black uppercase tracking-[0.22em]'

const topMenuButtonActiveClass =
  'shrink-0 whitespace-nowrap rounded-sm bg-cyan-300 px-2 py-1 text-sm font-black uppercase tracking-normal text-slate-950'
const topMenuButtonInactiveClass =
  'shrink-0 whitespace-nowrap rounded-sm border border-white/10 px-2 py-1 text-sm/5 font-black uppercase tracking-normal text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100'

const storyLabelBaseClass =
  'rounded-sm border px-1.5 py-px text-[0.65rem]/3 font-black uppercase tracking-[0.08em]'

export function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className={`${EYEBROW_TRACKING} text-cyan-300`}>{eyebrow}</p>
      <h2 className="mt-0.5 text-lg/5 font-black tracking-tight text-white">{title}</h2>
    </div>
  )
}

export function TopMenuButton({
  entry,
  isActive,
  onSelect,
}: {
  entry: { label: ActiveMenu; shortcut: string }
  isActive: boolean
  onSelect: (menu: ActiveMenu) => void
}) {
  return (
    <button
      className={isActive ? topMenuButtonActiveClass : topMenuButtonInactiveClass}
      type="button"
      aria-pressed={isActive}
      onClick={() => onSelect(entry.label)}
    >
      <span>{entry.label}</span> <span className="font-mono opacity-70">{entry.shortcut}</span>
    </button>
  )
}

/** `tone` is a Tailwind class fragment for border/background/text (full parity with previous string-based API). */
export function StoryLabel({ label, tone }: { label: string; tone: string }) {
  return <span className={`${storyLabelBaseClass} ${tone}`}>{label}</span>
}

export function LogMetric({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <article className="rounded-sm border border-white/10 bg-slate-950 p-3" title={hint}>
      <p className={`${EYEBROW_TRACKING} text-slate-300`}>{label}</p>
      <p className={`mt-1 font-mono text-2xl/7 font-black text-white ${valueClassName ?? ''}`}>{value}</p>
    </article>
  )
}

export function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm bg-slate-950 px-3 py-2">
      <span>{label}</span>
      <kbd className="rounded-sm bg-cyan-300 px-2 py-1 font-mono text-xs/4 font-black text-slate-950">{keys}</kbd>
    </div>
  )
}
