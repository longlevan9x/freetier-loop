import { ACCOUNT_STATUS } from '@freetier-loop/shared';
import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';

export interface CloudflareBindings extends Record<string, unknown> {
  DB?: D1Database;
  ASSETS?: Fetcher;
}

export default {
  async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    const deps = createDefaultDeps(env, {
      defer: (promise) => ctx.waitUntil(promise),
    });
    const app = createApp(deps);
    return app.fetch(request, env, ctx);
  },

  async scheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const deps = createDefaultDeps(env, {
      defer: (promise) => ctx.waitUntil(promise),
    });
    const accounts = await deps.providerAccountsService.list();
    for (const acc of accounts) {
      if (acc.status === ACCOUNT_STATUS.DISABLED || acc.status === ACCOUNT_STATUS.INVALID) {
        continue;
      }
      try {
        await deps.providerAccountsService.getUsage(acc.id);
      } catch (err) {
        deps.platform.logger.warn('Scheduled usage sync failed for account', {
          accountId: acc.id,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  },
};
