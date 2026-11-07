export const GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4';

export const GITLAB_ENDPOINTS = {
  USER: '/user',
  PROJECTS: '/projects',
  PROJECT_DETAIL: (id: string | number) => `/projects/${encodeURIComponent(String(id))}`,
  VARIABLES: (projectId: string | number) =>
    `/projects/${encodeURIComponent(String(projectId))}/variables`,
  VARIABLE_DETAIL: (projectId: string | number, key: string) =>
    `/projects/${encodeURIComponent(String(projectId))}/variables/${encodeURIComponent(key)}`,
} as const;
