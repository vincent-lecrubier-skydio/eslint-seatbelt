export function appendErrorContext(error: unknown, context: string) {
  if (error instanceof Error) {
    error.message += `\n  ${context}`
  }
}

export function isErrno(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code
}
