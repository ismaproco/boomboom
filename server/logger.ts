type LogLevel = 'info' | 'warn' | 'error'

const formatPayload = (level: LogLevel, message: string, requestId: string | undefined, extra?: Record<string, unknown>) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...extra,
  }
  return process.env.NODE_ENV === 'production' ? JSON.stringify(entry) : entry
}

export const logInfo = (message: string, requestId?: string, extra?: Record<string, unknown>) => {
  console.log(formatPayload('info', message, requestId, extra))
}

export const logWarn = (message: string, requestId?: string, extra?: Record<string, unknown>) => {
  console.warn(formatPayload('warn', message, requestId, extra))
}

export const logError = (message: string, requestId?: string, extra?: Record<string, unknown>) => {
  console.error(formatPayload('error', message, requestId, extra))
}

export const getRequestId = (headers: Headers) => headers.get('x-request-id')?.trim() || crypto.randomUUID()
