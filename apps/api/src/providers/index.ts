import { CloudflareAdapter } from './cloudflare/cloudflare.adapter';
import { GitHubAdapter } from './github/github.adapter';
import { GitLabAdapter } from './gitlab/gitlab.adapter';
import { ProviderRegistry } from './registry';
import { SupabaseAdapter } from './supabase/supabase.adapter';
import { VercelAdapter } from './vercel/vercel.adapter';

export * from './contracts';
export * from './http-client';
export * from './registry';
export * from './cloudflare/cloudflare.adapter';
export * from './vercel/vercel.adapter';
export * from './supabase/supabase.adapter';
export * from './gitlab/gitlab.adapter';
export * from './github/github.adapter';

export const createDefaultProviderRegistry = (): ProviderRegistry => {
  return new ProviderRegistry()
    .register(new CloudflareAdapter())
    .register(new VercelAdapter())
    .register(new SupabaseAdapter())
    .register(new GitLabAdapter())
    .register(new GitHubAdapter());
};
