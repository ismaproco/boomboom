export type ApiErrorCode = 'validation_error' | 'not_found' | 'conflict' | 'internal_error'

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
    details?: unknown
  }
}

export const apiError = (code: ApiErrorCode, message: string, details?: unknown): ApiErrorBody => ({
  error: { code, message, ...(details !== undefined ? { details } : {}) },
})

/** Legacy string errors from handlers — normalize to envelope when status is set. */
export const legacyErrorMessage = (body: unknown): string | null => {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const err = (body as { error: unknown }).error
    if (typeof err === 'string') return err
    if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message
    }
  }
  return null
}

export const statusToErrorCode = (status: number): ApiErrorCode => {
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status >= 400 && status < 500) return 'validation_error'
  return 'internal_error'
}
