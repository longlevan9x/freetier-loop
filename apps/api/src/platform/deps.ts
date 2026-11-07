import type { AppConfig } from '../config/env.schema';
import { getConfig } from '../config/env.schema';
import { type Logger, createConsoleLogger } from './logger';

export interface Clock {
  nowMs(): number;
}

export interface PlatformAdapters {
  logger: Logger;
  clock: Clock;
  defer(promise: Promise<unknown>): void;
}

export type Deps = {
  config: AppConfig;
  platform: PlatformAdapters;
};

export const systemClock: Clock = {
  nowMs: () => Date.now(),
};

export const createDefaultDeps = (
  rawEnv: Record<string, unknown> = {},
  overrides: Partial<PlatformAdapters> = {},
): Deps => {
  const config = getConfig(rawEnv);
  const platform: PlatformAdapters = {
    logger: overrides.logger ?? createConsoleLogger(),
    clock: overrides.clock ?? systemClock,
    defer:
      overrides.defer ??
      ((promise) => {
        void promise.catch(() => undefined);
      }),
  };
  return { config, platform };
};
