export const API_PREFIX = '/api/v1' as const;
export const AUTH_PREFIX = '/api/auth' as const;

export const API_ROUTES = {
  HEALTH: '/health',
  DASHBOARD_SUMMARY: '/dashboard/summary',
  PROVIDER_ACCOUNTS: '/provider-accounts',
  RESOURCES: '/resources',
  SNAPSHOTS: '/snapshots',
  MIGRATION_TEMPLATES: '/migration-templates',
  JOBS: '/jobs',
  AUDIT_LOGS: '/audit-logs',
  SETTINGS: '/settings',
} as const;

export const PUBLIC_API_ROUTES = [`${API_PREFIX}${API_ROUTES.HEALTH}`] as const;

export const WEB_ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  ACCOUNTS: '/accounts',
  DOMAINS: '/domains',
  PROJECTS: '/projects',
  MIGRATIONS: '/migrations',
  SNAPSHOTS: '/snapshots',
  AUDIT_LOGS: '/audit-logs',
  SETTINGS: '/settings',
} as const;

export type WebRoute = (typeof WEB_ROUTES)[keyof typeof WEB_ROUTES];
