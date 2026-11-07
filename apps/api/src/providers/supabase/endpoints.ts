export const SUPABASE_API_BASE_URL = 'https://api.supabase.com' as const;

export const SUPABASE_ENDPOINTS = {
  ORGANIZATIONS: '/v1/organizations',
  PROJECTS: '/v1/projects',
  PROJECT_DETAIL: (ref: string) => `/v1/projects/${ref}`,
  PROJECT_PAUSE: (ref: string) => `/v1/projects/${ref}/pause`,
  PROJECT_RESTORE: (ref: string) => `/v1/projects/${ref}/restore`,
  PROJECT_API_KEYS: (ref: string) => `/v1/projects/${ref}/api-keys`,
  PROJECT_SECRETS: (ref: string) => `/v1/projects/${ref}/secrets`,
  PROJECT_FUNCTIONS: (ref: string) => `/v1/projects/${ref}/functions`,
  PROJECT_FUNCTION_BODY: (ref: string, slug: string) =>
    `/v1/projects/${ref}/functions/${slug}/body`,
  PROJECT_FUNCTION_DEPLOY: (ref: string) => `/v1/projects/${ref}/functions/deploy`,
  PROJECT_DB_QUERY: (ref: string) => `/v1/projects/${ref}/database/query`,
  PROJECT_TRANSFER_PREVIEW: (ref: string) => `/v2/projects/${ref}/transfers/previews`,
  PROJECT_TRANSFER: (ref: string) => `/v2/projects/${ref}/transfers`,
} as const;
