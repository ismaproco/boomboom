export const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`
export const formatMoney = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatNullablePct = (value: number | null) => (value === null ? '—' : formatPct(value))
export const getChangeClass = (value: number | null) => (value === null ? 'text-slate-400' : value >= 0 ? 'text-emerald-300' : 'text-rose-300')
