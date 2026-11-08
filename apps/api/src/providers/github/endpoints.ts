export const GITHUB_API_BASE_URL = 'https://api.github.com';

export const GITHUB_ENDPOINTS = {
  USER: '/user',
  USER_REPOS: '/user/repos',
  REPO_DETAIL: (owner: string, repo: string) => `/repos/${owner}/${repo}`,
  VARIABLES: (owner: string, repo: string) => `/repos/${owner}/${repo}/actions/variables`,
  VARIABLE_DETAIL: (owner: string, repo: string, name: string) =>
    `/repos/${owner}/${repo}/actions/variables/${encodeURIComponent(name)}`,
  DISPATCH_WORKFLOW: (owner: string, repo: string, workflowId: string | number) =>
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(String(workflowId))}/dispatches`,
} as const;
