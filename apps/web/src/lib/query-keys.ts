export const queryKeys = {
  health: {
    all: ['health'] as const,
  },
  session: {
    current: ['session', 'current'] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
  },
  providerAccounts: {
    all: ['provider-accounts'] as const,
    detail: (id: string) => ['provider-accounts', id] as const,
    usage: (id: string) => ['provider-accounts', id, 'usage'] as const,
  },
  resources: {
    all: ['resources'] as const,
    list: (filters?: Record<string, unknown>) => ['resources', 'list', filters ?? {}] as const,
    detail: (id: string) => ['resources', 'detail', id] as const,
  },
  snapshots: {
    all: ['snapshots'] as const,
    detail: (id: string) => ['snapshots', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    templates: ['jobs', 'templates'] as const,
    detail: (id: string) => ['jobs', id] as const,
    events: (id: string) => ['jobs', id, 'events'] as const,
  },
  auditLogs: {
    all: ['audit-logs'] as const,
    list: (cursor?: string) => ['audit-logs', cursor ?? 'first'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
} as const;
