// Lightweight env-aware logger.
//
// Server-side (Node / Netlify functions): always emits, prefixed with level
// and timestamp so Netlify log streams stay greppable.
// Client-side: in production, only `error` and `warn` reach the console.
// `debug` and `info` are dropped entirely so we don't leak chatter to users.
//
// API mirrors `console` so migrations are one-for-one. Multiple args are
// passed through, allowing structured payloads as a final argument.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isServer = typeof window === 'undefined';
const isProd = process.env.NODE_ENV === 'production';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Lowest level that will be emitted. Server emits everything; client drops
// debug/info in production.
const minLevel: LogLevel = isServer
  ? 'debug'
  : isProd
    ? 'warn'
    : 'debug';

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

  if (isServer) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] ${level.toUpperCase()}`;
    const sink =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;
    sink(prefix, ...args);
    return;
  }

  const sink =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug;
  sink(...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};

export type Logger = typeof logger;
