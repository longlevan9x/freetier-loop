import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';

export interface CloudflareBindings extends Record<string, unknown> {
  DB?: D1Database;
  ASSETS?: Fetcher;
}

export default {
  async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext): Promise<Response> {
    const deps = createDefaultDeps(env, {
      defer: (promise) => ctx.waitUntil(promise),
    });
    const app = createApp(deps);
    return app.fetch(request, env, ctx);
  },
};
