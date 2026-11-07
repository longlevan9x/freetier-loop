export const VERCEL_API_BASE_URL = 'https://api.vercel.com' as const;

export const VERCEL_ENDPOINTS = {
  USER: '/v2/user',
  TEAMS: '/v2/teams',
  PROJECTS_LIST: '/v9/projects',
  PROJECT_DETAIL: (idOrName: string) => `/v9/projects/${idOrName}`,
  PROJECT_CREATE: '/v10/projects',
  PROJECT_TRANSFER_REQUEST: (idOrName: string) => `/v1/projects/${idOrName}/transfer-request`,
  PROJECT_TRANSFER_ACCEPT: (code: string) => `/v1/projects/transfer-request/${code}`,
  PROJECT_DOMAINS: (idOrName: string) => `/v9/projects/${idOrName}/domains`,
  PROJECT_DOMAIN_ADD: (idOrName: string) => `/v10/projects/${idOrName}/domains`,
  PROJECT_DOMAIN_DETAIL: (idOrName: string, domain: string) =>
    `/v9/projects/${idOrName}/domains/${domain}`,
  PROJECT_ENVS: (idOrName: string) => `/v10/projects/${idOrName}/env`,
  DEPLOYMENTS: '/v6/deployments',
} as const;
