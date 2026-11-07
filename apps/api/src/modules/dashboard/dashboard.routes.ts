import {
  ACCOUNT_STATUS,
  API_ROUTES,
  FREE_TIER_LIMITS,
  HTTP_STATUS,
  JOB_STATUS,
  RESOURCE_KIND,
  ok,
} from '@freetier-loop/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

export const createDashboardRoutes = () => {
  return new Hono<AppEnv>()
    .get(API_ROUTES.DASHBOARD_SUMMARY, async (c) => {
      const accounts = await c.var.deps.providerAccountsService.list();
      const resourcesPage = await c.var.deps.resourcesService.list({ limit: 100 });
      const jobsList = await c.var.deps.jobsService.list();
      const auditPage = await c.var.deps.auditService.list({ limit: 10 });

      const resources = resourcesPage.items;
      const zones = resources.filter((r) => r.kind === RESOURCE_KIND.ZONE);
      const cfRegistrarZones = zones.filter((z) =>
        Boolean(z.data.registrar || z.data.isCfRegistrar),
      );
      const vercelProjects = resources.filter((r) => r.kind === RESOURCE_KIND.VERCEL_PROJECT);
      const supabaseProjects = resources.filter((r) => r.kind === RESOURCE_KIND.SUPABASE_PROJECT);
      const activeJobs = jobsList.filter(
        (j) => j.status === JOB_STATUS.RUNNING || j.status === JOB_STATUS.WAITING_MANUAL,
      );

      return c.json(
        ok({
          accounts,
          counts: {
            totalAccounts: accounts.length,
            healthyAccounts: accounts.filter((a) => a.status === ACCOUNT_STATUS.ACTIVE).length,
            warningAccounts: accounts.filter(
              (a) =>
                a.status === ACCOUNT_STATUS.QUOTA_EXCEEDED || a.status === ACCOUNT_STATUS.INVALID,
            ).length,
            zonesCount: zones.length,
            cfRegistrarZonesCount: cfRegistrarZones.length,
            vercelProjectsCount: vercelProjects.length,
            supabaseProjectsCount: supabaseProjects.length,
            activeJobsCount: activeJobs.length,
          },
          recentJobs: jobsList.slice(0, 5),
          recentAuditLogs: auditPage.items,
        }),
        HTTP_STATUS.OK,
      );
    })
    .get(API_ROUTES.SETTINGS, (c) => {
      const cfg = c.var.deps.config;

      return c.json(
        ok({
          adminEmails: cfg.ADMIN_EMAILS,
          selfProtectedHosts: cfg.SELF_PROTECTED_HOSTS,
          freeTierLimits: FREE_TIER_LIMITS,
          encryptionKeyVersion: 1,
        }),
        HTTP_STATUS.OK,
      );
    });
};
