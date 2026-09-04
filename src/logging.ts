const MAX_ERROR_INPUT_LENGTH = 8_000
const MAX_ERROR_OUTPUT_LENGTH = 2_000

const AUTHORIZATION_PATTERN = /\b(authorization)(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;}]+/gi
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi
const URL_SECRET_PATTERN = /([?&](?:code|state|code_verifier|access_token|refresh_token|id_token|client_secret)=)[^&#\s]*/gi
const ASSIGNMENT_SECRET_PATTERN = /\b(access_token|refresh_token|id_token|authorization_code|code_verifier|client_secret|api[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const bounded = raw.slice(0, MAX_ERROR_INPUT_LENGTH)
  const redacted = bounded
    .replace(AUTHORIZATION_PATTERN, '$1$2[REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(URL_SECRET_PATTERN, '$1[REDACTED]')
    .replace(ASSIGNMENT_SECRET_PATTERN, '$1$2[REDACTED]')
  return redacted.length > MAX_ERROR_OUTPUT_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_OUTPUT_LENGTH)}…`
    : redacted
}
