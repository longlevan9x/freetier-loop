export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

const REDACTED_KEYS = new Set([
  'password',
  'apiToken',
  'token',
  'encryptedToken',
  'authorization',
  'cookie',
  'secret',
]);

const sanitizeContext = (ctx?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    out[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : value;
  }
  return out;
};

export const createConsoleLogger = (defaultCtx: Record<string, unknown> = {}): Logger => {
  const write = (level: LogLevel, msg: string, ctx?: Record<string, unknown>) => {
    const entry = {
      level,
      msg,
      ts: new Date().toISOString(),
      ...defaultCtx,
      ...sanitizeContext(ctx),
    };
    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  };

  return {
    debug: (msg, ctx) => write('debug', msg, ctx),
    info: (msg, ctx) => write('info', msg, ctx),
    warn: (msg, ctx) => write('warn', msg, ctx),
    error: (msg, ctx) => write('error', msg, ctx),
  };
};
