import {
  CAPABILITY,
  type Capability,
  DNS_RECORD_TYPE_VALUES,
  FREE_TIER_LIMITS,
  PROVIDER,
  USAGE_METRIC,
  ZONE_STATUS_VALUES,
} from '@freetier-loop/shared';
import { z } from 'zod';
import type {
  AccountVerifier,
  CapabilityMap,
  DnsBatchInput,
  DnsRecordProvider,
  NormalizedDnsRecord,
  NormalizedProjectDomain,
  NormalizedRegistrarDomain,
  NormalizedZone,
  ProjectDomainProvider,
  ProviderAdapter,
  ProviderContext,
  RegistrarDomainProvider,
  UsageMetricSnapshot,
  UsageProvider,
  VerifiedAccountInfo,
  ZoneProvider,
} from '../contracts';
import { createHttpClient } from '../http-client';
import { CF_API_BASE_URL, CF_ENDPOINTS } from './endpoints';

const cfZoneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(ZONE_STATUS_VALUES).catch('pending'),
    name_servers: z.array(z.string()).default([]),
  })
  .passthrough();

const cfDnsRecordSchema = z
  .object({
    id: z.string(),
    type: z.enum(DNS_RECORD_TYPE_VALUES).catch('A'),
    name: z.string(),
    content: z.string(),
    ttl: z.number().default(1),
    proxied: z.boolean().default(false),
    priority: z.number().optional(),
    comment: z.string().nullable().optional(),
  })
  .passthrough();

export class CloudflareAdapter
  implements
    ProviderAdapter,
    AccountVerifier,
    ZoneProvider,
    RegistrarDomainProvider,
    DnsRecordProvider,
    ProjectDomainProvider,
    UsageProvider
{
  public readonly id = PROVIDER.CLOUDFLARE;

  private client(ctx: ProviderContext) {
    return createHttpClient({
      baseUrl: CF_API_BASE_URL,
      token: ctx.token,
      ...(ctx.budget ? { budget: ctx.budget } : {}),
      ...(ctx.fetchFn ? { fetchFn: ctx.fetchFn } : {}),
    });
  }

  getCapability<K extends Capability>(capability: K): CapabilityMap[K] | null {
    switch (capability) {
      case CAPABILITY.ACCOUNT_VERIFIER:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.ZONES:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.REGISTRAR_DOMAINS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.DNS_RECORDS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.PROJECT_DOMAINS:
        return this as unknown as CapabilityMap[K];
      case CAPABILITY.USAGE:
        return this as unknown as CapabilityMap[K];
      default:
        return null;
    }
  }

  async verify(ctx: ProviderContext): Promise<VerifiedAccountInfo> {
    const http = this.client(ctx);
    const verifyRes = await http.request<{
      success: boolean;
      result: { id: string; status: string };
    }>({
      path: CF_ENDPOINTS.VERIFY_TOKEN,
    });

    const accountsRes = await http.request<{
      success: boolean;
      result: Array<{ id: string; name: string }>;
    }>({
      path: CF_ENDPOINTS.ACCOUNTS,
      query: { page: 1, per_page: 20 },
    });

    const firstAccount = accountsRes.result[0];
    const externalAccountId = ctx.externalAccountId ?? firstAccount?.id ?? verifyRes.result.id;

    return {
      valid: verifyRes.result.status === 'active',
      externalAccountId,
      ...(firstAccount?.name ? { labelSuggested: firstAccount.name } : {}),
      scopesVerified: ['zones:read', 'dns:edit', 'workers:read'],
    };
  }

  async listZones(
    ctx: ProviderContext,
    cursor?: string,
  ): Promise<{ items: NormalizedZone[]; nextCursor: string | null }> {
    const page = cursor ? Number.parseInt(cursor, 10) : 1;
    const http = this.client(ctx);
    const res = await http.request<{
      result: unknown[];
      result_info?: { page: number; total_pages: number };
    }>({
      path: CF_ENDPOINTS.ZONES,
      query: {
        page,
        per_page: 50,
        ...(ctx.externalAccountId ? { 'account.id': ctx.externalAccountId } : {}),
      },
    });

    const registrarSet = new Set<string>();
    if (ctx.externalAccountId) {
      try {
        const regDomains = await this.listRegistrarDomains(ctx);
        for (const d of regDomains) {
          registrarSet.add(d.name.toLowerCase());
        }
      } catch {
        // Ignore if token does not include registrar read scope
      }
    }

    const items: NormalizedZone[] = res.result.map((raw) => {
      const zObj = cfZoneSchema.parse(raw);
      return {
        id: zObj.id,
        name: zObj.name,
        status: zObj.status,
        nameServers: zObj.name_servers,
        registrar: registrarSet.has(zObj.name.toLowerCase()),
      };
    });

    const totalPages = res.result_info?.total_pages ?? 1;
    const nextCursor = page < totalPages ? String(page + 1) : null;
    return { items, nextCursor };
  }

  async getZone(ctx: ProviderContext, zoneId: string): Promise<NormalizedZone> {
    const http = this.client(ctx);
    const res = await http.request<{ result: unknown }>({
      path: CF_ENDPOINTS.ZONE_DETAIL(zoneId),
    });
    const parsed = cfZoneSchema.parse(res.result);
    return {
      id: parsed.id,
      name: parsed.name,
      status: parsed.status,
      nameServers: parsed.name_servers,
    };
  }

  async createZone(
    ctx: ProviderContext,
    input: { name: string; accountId: string },
  ): Promise<NormalizedZone> {
    const http = this.client(ctx);
    const res = await http.request<{ result: unknown }>({
      method: 'POST',
      path: CF_ENDPOINTS.ZONES,
      body: {
        name: input.name,
        account: { id: input.accountId },
        jump_start: false,
      },
    });
    const parsed = cfZoneSchema.parse(res.result);
    return {
      id: parsed.id,
      name: parsed.name,
      status: parsed.status,
      nameServers: parsed.name_servers,
    };
  }

  async deleteZone(ctx: ProviderContext, zoneId: string): Promise<void> {
    const http = this.client(ctx);
    await http.request({
      method: 'DELETE',
      path: CF_ENDPOINTS.ZONE_DETAIL(zoneId),
    });
  }

  async getZoneSettings(ctx: ProviderContext, zoneId: string): Promise<Record<string, string>> {
    const http = this.client(ctx);
    const res = await http.request<{ result: Array<{ id: string; value: unknown }> }>({
      path: CF_ENDPOINTS.ZONE_SETTINGS(zoneId),
    });
    const wanted = new Set([
      'ssl',
      'always_use_https',
      'min_tls_version',
      'automatic_https_rewrites',
    ]);
    const out: Record<string, string> = {};
    for (const item of res.result) {
      if (
        wanted.has(item.id) &&
        (typeof item.value === 'string' || typeof item.value === 'number')
      ) {
        out[item.id] = String(item.value);
      }
    }
    return out;
  }

  async updateZoneSettings(
    ctx: ProviderContext,
    zoneId: string,
    settings: Record<string, string>,
  ): Promise<void> {
    const http = this.client(ctx);
    const items = Object.entries(settings).map(([id, value]) => ({ id, value }));
    if (items.length === 0) return;
    await http.request({
      method: 'PATCH',
      path: CF_ENDPOINTS.ZONE_SETTINGS(zoneId),
      body: { items },
    });
  }

  async getDnssecStatus(ctx: ProviderContext, zoneId: string): Promise<{ enabled: boolean }> {
    const http = this.client(ctx);
    const res = await http.request<{ result: { status?: string } }>({
      path: CF_ENDPOINTS.ZONE_DNSSEC(zoneId),
    });
    return { enabled: res.result.status === 'active' || res.result.status === 'pending' };
  }

  async getEmailRoutingStatus(ctx: ProviderContext, zoneId: string): Promise<{ enabled: boolean }> {
    const http = this.client(ctx);
    const res = await http.request<{ result: { enabled?: boolean } }>({
      path: CF_ENDPOINTS.ZONE_EMAIL_ROUTING(zoneId),
    });
    return { enabled: Boolean(res.result.enabled) };
  }

  async listRegistrarDomains(ctx: ProviderContext): Promise<NormalizedRegistrarDomain[]> {
    if (!ctx.externalAccountId) return [];
    const http = this.client(ctx);
    const res = await http.request<{
      result: Array<{
        id: string;
        name: string;
        current_registrar?: string;
        locked?: boolean;
        auto_renew?: boolean;
        expires_at?: string;
        created_at?: string;
      }>;
    }>({
      path: CF_ENDPOINTS.REGISTRAR_DOMAINS(ctx.externalAccountId),
    });

    return res.result.map((d) => ({
      id: d.id,
      name: d.name,
      registrar: d.current_registrar ?? 'Cloudflare',
      locked: Boolean(d.locked),
      autoRenew: Boolean(d.auto_renew),
      ...(d.expires_at ? { expiresAt: d.expires_at } : {}),
      ...(d.created_at ? { createdAt: d.created_at } : {}),
    }));
  }

  async listRecords(
    ctx: ProviderContext,
    zoneId: string,
    cursor?: string,
  ): Promise<{ items: NormalizedDnsRecord[]; nextCursor: string | null }> {
    const page = cursor ? Number.parseInt(cursor, 10) : 1;
    const http = this.client(ctx);
    const res = await http.request<{
      result: unknown[];
      result_info?: { page: number; total_pages: number };
    }>({
      path: CF_ENDPOINTS.DNS_RECORDS(zoneId),
      query: { page, per_page: 100 },
    });

    const items: NormalizedDnsRecord[] = res.result.map((raw) => {
      const rec = cfDnsRecordSchema.parse(raw);
      return {
        id: rec.id,
        type: rec.type,
        name: rec.name,
        content: rec.content,
        ttl: rec.ttl,
        proxied: rec.proxied,
        ...(rec.priority !== undefined ? { priority: rec.priority } : {}),
        ...(rec.comment ? { comment: rec.comment } : {}),
      };
    });

    const totalPages = res.result_info?.total_pages ?? 1;
    const nextCursor = page < totalPages ? String(page + 1) : null;
    return { items, nextCursor };
  }

  async exportBind(ctx: ProviderContext, zoneId: string): Promise<string> {
    const http = this.client(ctx);
    return http.request<string>({
      path: CF_ENDPOINTS.DNS_EXPORT(zoneId),
      rawText: true,
    });
  }

  async batchApply(
    ctx: ProviderContext,
    zoneId: string,
    batch: DnsBatchInput,
  ): Promise<{ createdCount: number; updatedCount: number; deletedCount: number }> {
    const http = this.client(ctx);
    const res = await http.request<{
      result: {
        posts?: unknown[];
        patches?: unknown[];
        puts?: unknown[];
        deletes?: unknown[];
      };
    }>({
      method: 'POST',
      path: CF_ENDPOINTS.DNS_BATCH(zoneId),
      body: batch,
    });

    return {
      createdCount: res.result.posts?.length ?? 0,
      updatedCount: (res.result.patches?.length ?? 0) + (res.result.puts?.length ?? 0),
      deletedCount: res.result.deletes?.length ?? 0,
    };
  }

  async listProjectDomains(
    ctx: ProviderContext,
    projectId: string,
  ): Promise<NormalizedProjectDomain[]> {
    const accountId = ctx.externalAccountId ?? projectId;
    const http = this.client(ctx);
    const res = await http.request<{
      result: Array<{ id: string; hostname: string; service: string }>;
    }>({
      path: CF_ENDPOINTS.WORKERS_DOMAINS(accountId),
    });

    return res.result.map((d) => ({
      name: d.hostname,
      projectId: d.service,
      verified: true,
    }));
  }

  async addProjectDomain(
    ctx: ProviderContext,
    projectId: string,
    domain: string,
  ): Promise<NormalizedProjectDomain> {
    const accountId = ctx.externalAccountId ?? 'default';
    const http = this.client(ctx);
    await http.request({
      method: 'PUT',
      path: CF_ENDPOINTS.WORKERS_DOMAINS(accountId),
      body: {
        environment: 'production',
        hostname: domain,
        service: projectId,
      },
    });
    return {
      name: domain,
      projectId,
      verified: true,
    };
  }

  async removeProjectDomain(
    ctx: ProviderContext,
    projectId: string,
    domain: string,
  ): Promise<void> {
    const accountId = ctx.externalAccountId ?? projectId;
    const http = this.client(ctx);
    await http.request({
      method: 'DELETE',
      path: `${CF_ENDPOINTS.WORKERS_DOMAINS(accountId)}/${domain}`,
    });
  }

  async getUsage(ctx: ProviderContext): Promise<UsageMetricSnapshot[]> {
    const http = this.client(ctx);
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const res = await http.request<{
      data?: {
        viewer?: {
          accounts?: Array<{
            workersInvocationsAdaptive?: Array<{
              sum?: { requests?: number };
            }>;
          }>;
        };
      };
    }>({
      method: 'POST',
      path: CF_ENDPOINTS.GRAPHQL,
      body: {
        query:
          'query GetWorkersUsage($accountTag: String!, $datetimeStart: String!, $datetimeEnd: String!) { viewer { accounts(filter: { accountTag: $accountTag }) { workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }) { sum { requests errors subrequests } } } } }',
        variables: {
          accountTag: ctx.externalAccountId ?? '',
          datetimeStart: startOfDay.toISOString(),
          datetimeEnd: now.toISOString(),
        },
      },
    });

    const invocations = res.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
    const totalRequests = invocations.reduce((acc, row) => acc + (row.sum?.requests ?? 0), 0);
    const limit = FREE_TIER_LIMITS.CF_WORKERS_REQUESTS_PER_DAY;
    const ratio = totalRequests / limit;

    return [
      {
        metric: USAGE_METRIC.WORKERS_REQUESTS,
        value: totalRequests,
        limit,
        ratio,
        ...(ratio >= FREE_TIER_LIMITS.QUOTA_WARN_RATIO
          ? { warning: `Workers requests at ${Math.round(ratio * 100)}% of daily free quota` }
          : {}),
      },
    ];
  }
}
