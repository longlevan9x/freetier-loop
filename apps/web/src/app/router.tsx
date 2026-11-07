import { BENTO_SIZE, PROVIDER_LABEL, WEB_ROUTES } from '@freetier-loop/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Activity, ArrowRightLeft, Cloud, Database, Globe, ShieldCheck } from 'lucide-react';
import { BentoCard } from '../components/bento/BentoCard';
import { BentoGrid } from '../components/bento/BentoGrid';
import { queryKeys } from '../lib/query-keys';
import { apiClient } from '../lib/rpc';

const RootLayout = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <div>
              <span className="font-semibold tracking-tight">freetier-loop</span>
              <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                Admin Console
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-5 text-sm text-zinc-400">
            <Link
              to={WEB_ROUTES.DASHBOARD}
              className="transition-colors hover:text-zinc-100 [&.active]:text-emerald-400"
            >
              Dashboard
            </Link>
            <Link
              to={WEB_ROUTES.ACCOUNTS}
              className="transition-colors hover:text-zinc-100 [&.active]:text-emerald-400"
            >
              Accounts
            </Link>
            <Link
              to={WEB_ROUTES.DOMAINS}
              className="transition-colors hover:text-zinc-100 [&.active]:text-emerald-400"
            >
              Domains
            </Link>
            <Link
              to={WEB_ROUTES.PROJECTS}
              className="transition-colors hover:text-zinc-100 [&.active]:text-emerald-400"
            >
              Projects
            </Link>
            <Link
              to={WEB_ROUTES.MIGRATIONS}
              className="transition-colors hover:text-zinc-100 [&.active]:text-emerald-400"
            >
              Migrations
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

const DashboardPage = () => {
  const healthQuery = useQuery({
    queryKey: queryKeys.health.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.health.$get();
      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status}`);
      }
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quota & Migration Overview</h1>
        <p className="text-sm text-zinc-400">
          Manage and rotate resources across {PROVIDER_LABEL.cloudflare}, {PROVIDER_LABEL.vercel},
          and {PROVIDER_LABEL.supabase}.
        </p>
      </div>

      <BentoGrid>
        <BentoCard
          title="Quota Overview"
          subtitle="Daily requests & active free-tier slots across accounts"
          size={BENTO_SIZE.XL}
          icon={<Cloud className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xs text-zinc-400">{PROVIDER_LABEL.cloudflare}</div>
              <div className="mt-1 text-lg font-semibold">100k req / day</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xs text-zinc-400">{PROVIDER_LABEL.vercel}</div>
              <div className="mt-1 text-lg font-semibold">Hobby & Team</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xs text-zinc-400">{PROVIDER_LABEL.supabase}</div>
              <div className="mt-1 text-lg font-semibold">2 active projects / user</div>
            </div>
          </div>
        </BentoCard>

        <BentoCard
          title="API Health"
          subtitle="Hono RPC typed connection"
          size={BENTO_SIZE.MD}
          icon={<Activity className="h-4 w-4" />}
          loading={healthQuery.isPending}
          error={healthQuery.error instanceof Error ? healthQuery.error.message : null}
        >
          <div className="flex items-center gap-2 pt-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-xs text-zinc-300">
              status: {healthQuery.data?.data.status ?? 'connecting'}
            </span>
          </div>
        </BentoCard>

        <BentoCard
          title="Cloudflare Registrar Domains"
          subtitle="Safe pre-staged DNS & guided transfer"
          size={BENTO_SIZE.MD}
          icon={<Globe className="h-4 w-4" />}
        >
          <p className="text-xs text-zinc-400">
            Pre-creates target zone & imports DNS records in a single batch before registrar move.
          </p>
        </BentoCard>

        <BentoCard
          title="Supabase Free-Tier Slots"
          subtitle="Quick Pause / Restore & Cross-Account Recreate"
          size={BENTO_SIZE.MD}
          icon={<Database className="h-4 w-4" />}
        >
          <p className="text-xs text-zinc-400">
            Includes Edge Functions migration, pg_dump helper, row-count verification & ENV_REWIRE.
          </p>
        </BentoCard>

        <BentoCard
          title="Security Guardrails"
          subtitle="AES-256-GCM & Blue-Green Cutover"
          size={BENTO_SIZE.MD}
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <p className="text-xs text-zinc-400">
            Self-protected admin domain, Turnstile login guard, and encrypted snapshots.
          </p>
        </BentoCard>
      </BentoGrid>
    </div>
  );
};

const PlaceholderPage = ({ title }: { title: string }) => (
  <BentoGrid>
    <BentoCard title={title} size={BENTO_SIZE.FULL}>
      <p className="text-sm text-zinc-400">{title} module ready for M2/M3 integration.</p>
    </BentoCard>
  </BentoGrid>
);

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.DASHBOARD,
  component: DashboardPage,
});

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.ACCOUNTS,
  component: () => <PlaceholderPage title="Provider Accounts" />,
});

const domainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.DOMAINS,
  component: () => <PlaceholderPage title="Domains & DNS Zones" />,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.PROJECTS,
  component: () => <PlaceholderPage title="Projects & Databases" />,
});

const migrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.MIGRATIONS,
  component: () => <PlaceholderPage title="Migration Jobs" />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  accountsRoute,
  domainsRoute,
  projectsRoute,
  migrationsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
