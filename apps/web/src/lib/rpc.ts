import type { AppType } from '@freetier-loop/api/app';
import { hc } from 'hono/client';
import { webEnv } from '../config/env';

export const createApiClient = (baseUrl: string = webEnv.VITE_API_BASE_URL) =>
  hc<AppType>(baseUrl, {
    init: {
      credentials: 'include',
    },
  });

export const apiClient = createApiClient();
