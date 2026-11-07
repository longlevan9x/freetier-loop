export const CF_API_BASE_URL = 'https://api.cloudflare.com/client/v4' as const;

export const CF_ENDPOINTS = {
  VERIFY_TOKEN: '/user/tokens/verify',
  ACCOUNTS: '/accounts',
  ZONES: '/zones',
  ZONE_DETAIL: (zoneId: string) => `/zones/${zoneId}`,
  ZONE_SETTINGS: (zoneId: string) => `/zones/${zoneId}/settings`,
  ZONE_DNSSEC: (zoneId: string) => `/zones/${zoneId}/dnssec`,
  ZONE_EMAIL_ROUTING: (zoneId: string) => `/zones/${zoneId}/email/routing`,
  DNS_RECORDS: (zoneId: string) => `/zones/${zoneId}/dns_records`,
  DNS_EXPORT: (zoneId: string) => `/zones/${zoneId}/dns_records/export`,
  DNS_BATCH: (zoneId: string) => `/zones/${zoneId}/dns_records/batch`,
  REGISTRAR_DOMAINS: (accountId: string) => `/accounts/${accountId}/registrar/domains`,
  WORKERS_DOMAINS: (accountId: string) => `/accounts/${accountId}/workers/domains`,
  GRAPHQL: '/graphql',
} as const;
