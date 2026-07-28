export const formatTerminalTime = (value: string) => new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(value))

export const formatArchiveTime = (value: string) => new Intl.DateTimeFormat('en', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value))
