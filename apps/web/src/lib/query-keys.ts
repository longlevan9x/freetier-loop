export const queryKeys = {
  health: {
    all: ['health'] as const,
  },
  dashboard: {
    summary: () => ['dashboard', 'summary'] as const,
  },
  providerAccounts: {
    all: ['provider-accounts'] as const,
    detail: (id: string) => ['provider-accounts', id] as const,
    usage: (id: string) => ['provider-accounts', id, 'usage'] as const,
  },
  resources: {
    list: (filters: Record<string, unknown>) => ['resources', 'list', filters] as const,
    detail: (id: string) => ['resources', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    detail: (id: string) => ['jobs', id] as const,
    events: (id: string) => ['jobs', id, 'events'] as const,
  },
} as const;
