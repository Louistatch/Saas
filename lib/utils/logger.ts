/**
 * Tiny prefixed logger so call sites are consistent and easy to filter.
 * In production we send `error` to console.error; everything else is a no-op
 * unless `NEXT_PUBLIC_DEBUG=1`.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const isProd = process.env.NODE_ENV === 'production'
const isDebug =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG === '1'

function emit(level: Level, scope: string, args: unknown[]) {
  if (isProd && level !== 'error' && !isDebug) return
  const tag = `[${scope}]`
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug
  fn(tag, ...args)
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args),
  }
}

export const logger = createLogger('app')
