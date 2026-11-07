import { BENTO_SIZE, WEB_ROUTES } from '@freetier-loop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { ArrowRightLeft, Command, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BentoCard } from '../components/bento/BentoCard';
import { BentoGrid } from '../components/bento/BentoGrid';
import { AccountsView } from '../features/accounts/components/AccountsView';
import { AuditLogsView } from '../features/audit/components/AuditLogsView';
import { LoginPage } from '../features/auth/components/LoginPage';
import { DashboardView } from '../features/dashboard/components/DashboardView';
import { DomainsView } from '../features/domains/components/DomainsView';
import { MigrationsView } from '../features/migrations/components/MigrationsView';
import { ProjectsView } from '../features/projects/components/ProjectsView';
import { SettingsView } from '../features/settings/components/SettingsView';
import { SnapshotsView } from '../features/snapshots/components/SnapshotsView';
import { fetchCurrentSession, signOutSession } from '../lib/auth-client';
import { queryKeys } from '../lib/query-keys';

const NAV_ITEMS = [
  { label: 'Dashboard', to: WEB_ROUTES.DASHBOARD },
  { label: 'Accounts', to: WEB_ROUTES.ACCOUNTS },
  { label: 'Domains', to: WEB_ROUTES.DOMAINS },
  { label: 'Projects', to: WEB_ROUTES.PROJECTS },
  { label: 'Migrations', to: WEB_ROUTES.MIGRATIONS },
  { label: 'Snapshots', to: WEB_ROUTES.SNAPSHOTS },
  { label: 'Audit Logs', to: WEB_ROUTES.AUDIT_LOGS },
  { label: 'Settings', to: WEB_ROUTES.SETTINGS },
] as const;

export const RootLayout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const routerState = useRouterState();
  const isLoginPage = routerState.location.pathname === WEB_ROUTES.LOGIN;

  const sessionQuery = useQuery({
    queryKey: queryKeys.session.current,
    queryFn: fetchCurrentSession,
    retry: false,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSignOut = async () => {
    await signOutSession();
    queryClient.setQueryData(queryKeys.session.current, null);
    await navigate({ to: WEB_ROUTES.LOGIN });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {!isLoginPage ? (
        <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
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

            <nav
              aria-label="Primary navigation"
              className="flex flex-wrap items-center gap-4 text-sm text-zinc-400"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="transition-colors hover:text-zinc-100 [&.active]:font-medium [&.active]:text-emerald-400"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              >
                <Command className="h-3 w-3" />
                <span>⌘K</span>
              </button>

              {sessionQuery.data ? (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-800/60 hover:text-red-300"
                >
                  <LogOut className="h-3 w-3" />
                  Sign Out
                </button>
              ) : (
                <Link
                  to={WEB_ROUTES.LOGIN}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-emerald-400 hover:border-emerald-500/60"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main className={isLoginPage ? 'w-full' : 'mx-auto max-w-7xl px-6 py-8'}>
        <Outlet />
      </main>

      {paletteOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24 p-4">
          <dialog
            open
            aria-label="Command palette"
            className="m-0 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>Quick Navigation (Esc to close)</span>
            </div>
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => {
                    setPaletteOpen(false);
                    void navigate({ to: item.to });
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-xs text-zinc-500">{item.to}</span>
                </button>
              ))}
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
};

const NotFoundPage = () => (
  <BentoGrid>
    <BentoCard title="404 — Page Not Found" size={BENTO_SIZE.FULL}>
      <p className="text-sm text-zinc-400">
        The requested route does not exist.{' '}
        <Link to={WEB_ROUTES.DASHBOARD} className="text-emerald-400 underline">
          Return to Dashboard
        </Link>
      </p>
    </BentoCard>
  </BentoGrid>
);

const requireAuthGuard = async () => {
  const session = await fetchCurrentSession();
  if (!session) {
    throw redirect({
      to: WEB_ROUTES.LOGIN,
    });
  }
  return { session };
};

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.LOGIN,
  beforeLoad: async () => {
    const session = await fetchCurrentSession();
    if (session) {
      throw redirect({
        to: WEB_ROUTES.DASHBOARD,
      });
    }
  },
  component: LoginPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.DASHBOARD,
  beforeLoad: requireAuthGuard,
  component: DashboardView,
});

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.ACCOUNTS,
  beforeLoad: requireAuthGuard,
  component: AccountsView,
});

const domainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.DOMAINS,
  beforeLoad: requireAuthGuard,
  component: DomainsView,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.PROJECTS,
  beforeLoad: requireAuthGuard,
  component: ProjectsView,
});

const migrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.MIGRATIONS,
  beforeLoad: requireAuthGuard,
  component: MigrationsView,
});

const snapshotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.SNAPSHOTS,
  beforeLoad: requireAuthGuard,
  component: SnapshotsView,
});

const auditLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.AUDIT_LOGS,
  beforeLoad: requireAuthGuard,
  component: AuditLogsView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: WEB_ROUTES.SETTINGS,
  beforeLoad: requireAuthGuard,
  component: SettingsView,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  accountsRoute,
  domainsRoute,
  projectsRoute,
  migrationsRoute,
  snapshotsRoute,
  auditLogsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
