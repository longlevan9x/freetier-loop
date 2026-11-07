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
import {
  Activity,
  ArrowRightLeft,
  Camera,
  Command,
  FolderGit2,
  Globe,
  LayoutDashboard,
  LogOut,
  Route as MigrationIcon,
  Server,
  Settings,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
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

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    to: WEB_ROUTES.DASHBOARD,
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: 'Accounts',
    to: WEB_ROUTES.ACCOUNTS,
    icon: <Server className="h-4 w-4" />,
  },
  {
    label: 'Domains',
    to: WEB_ROUTES.DOMAINS,
    icon: <Globe className="h-4 w-4" />,
  },
  {
    label: 'Projects',
    to: WEB_ROUTES.PROJECTS,
    icon: <FolderGit2 className="h-4 w-4" />,
  },
  {
    label: 'Migrations',
    to: WEB_ROUTES.MIGRATIONS,
    icon: <MigrationIcon className="h-4 w-4" />,
  },
  {
    label: 'Snapshots',
    to: WEB_ROUTES.SNAPSHOTS,
    icon: <Camera className="h-4 w-4" />,
  },
  {
    label: 'Audit Logs',
    to: WEB_ROUTES.AUDIT_LOGS,
    icon: <Activity className="h-4 w-4" />,
  },
  {
    label: 'Settings',
    to: WEB_ROUTES.SETTINGS,
    icon: <Settings className="h-4 w-4" />,
  },
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

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar (Vertical Navigation) */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur">
        <div className="space-y-6">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3 px-2 py-1">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ArrowRightLeft className="h-5 w-5" />
            </span>
            <div>
              <div className="font-bold tracking-tight text-zinc-100">freetier-loop</div>
              <div className="text-[11px] font-medium text-emerald-400/90">
                Cloud Migration Console
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Sidebar navigation" className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100 [&.active]:bg-emerald-500/15 [&.active]:font-semibold [&.active]:text-emerald-400"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom Actions & User Profile */}
        <div className="space-y-2 border-t border-zinc-800/80 pt-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Command className="h-3.5 w-3.5" />
              <span>Command Palette</span>
            </span>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ⌘K
            </kbd>
          </button>

          {sessionQuery.data ? (
            <div className="flex items-center justify-between rounded-xl bg-zinc-950/60 p-2.5">
              <div className="min-w-0 pr-2">
                <div className="truncate text-xs font-semibold text-zinc-200">
                  {sessionQuery.data.name}
                </div>
                <div className="truncate font-mono text-[10px] text-zinc-500">
                  {sessionQuery.data.email}
                </div>
              </div>
              <button
                type="button"
                title="Sign Out"
                onClick={() => void handleSignOut()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-950/40 hover:text-red-400 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              to={WEB_ROUTES.LOGIN}
              className="flex w-full items-center justify-center rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* ⌘K Command Palette Modal */}
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
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
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
