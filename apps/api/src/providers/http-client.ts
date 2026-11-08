import { AppError, ERROR_CODE, HEADER, HTTP_STATUS, WORKER_BUDGET } from '@freetier-loop/shared';
import type { z } from 'zod';

export class SubrequestBudget {
  private count = 0;

  constructor(
    private readonly maxSubrequests: number = WORKER_BUDGET.MAX_SUBREQUESTS_PER_INVOCATION,
  ) {}

  consume(amount = 1): void {
    if (this.count + amount > this.maxSubrequests) {
      throw new AppError(
        ERROR_CODE.PROVIDER_BUDGET_EXCEEDED,
        `Subrequest budget exceeded (${this.count}/${this.maxSubrequests})`,
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }
    this.count += amount;
  }

  get used(): number {
    return this.count;
  }

  get remaining(): number {
    return Math.max(0, this.maxSubrequests - this.count);
  }
}

export type HttpClientOptions = {
  baseUrl: string;
  token?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  budget?: SubrequestBudget;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
};

export type RequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  schema?: z.ZodType<T>;
  rawText?: boolean;
};

export interface HttpClient {
  request<T = unknown>(options: RequestOptions<T>): Promise<T>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string => {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
};

const parseRetryAfterMs = (headerVal: string | null, attempt: number, baseMs: number): number => {
  if (headerVal) {
    const seconds = Number.parseFloat(headerVal);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  return baseMs * 2 ** attempt;
};

export const createHttpClient = (options: HttpClientOptions): HttpClient => {
  const timeoutMs = options.timeoutMs ?? WORKER_BUDGET.HTTP_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? WORKER_BUDGET.HTTP_MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? WORKER_BUDGET.HTTP_RETRY_BASE_MS;
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? defaultSleep;

  return {
    async request<T = unknown>(req: RequestOptions<T>): Promise<T> {
      const method = req.method ?? 'GET';
      const url = buildUrl(options.baseUrl, req.path, req.query);

      const headers: Record<string, string> = {
        ...(options.token ? { [HEADER.AUTHORIZATION]: `Bearer ${options.token}` } : {}),
        ...(req.body !== undefined && typeof req.body !== 'string'
          ? { [HEADER.CONTENT_TYPE]: 'application/json' }
          : {}),
        ...options.headers,
        ...req.headers,
      };

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        options.budget?.consume(1);

        let response: Response;
        try {
          response = await fetchFn(url, {
            method,
            headers,
            ...(req.body !== undefined
              ? {
                  body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
                }
              : {}),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          const isTimeout =
            err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
          if (isTimeout) {
            throw new AppError(
              ERROR_CODE.PROVIDER_TIMEOUT,
              `Provider request timed out after ${timeoutMs}ms: ${method} ${req.path}`,
              { status: HTTP_STATUS.GATEWAY_TIMEOUT, cause: err },
            );
          }
          throw new AppError(
            ERROR_CODE.PROVIDER_UPSTREAM_ERROR,
            `Provider network error on ${method} ${req.path}`,
            { status: HTTP_STATUS.BAD_GATEWAY, cause: err },
          );
        }

        const isRetryable = response.status === 429 || response.status >= 500;
        if (isRetryable && attempt < maxRetries) {
          const delayMs = parseRetryAfterMs(
            response.headers.get(HEADER.RETRY_AFTER),
            attempt,
            retryBaseMs,
          );
          await sleepFn(delayMs);
          continue;
        }

        if (!response.ok) {
          let details: unknown;
          try {
            details = await response.json();
          } catch {
            details = await response.text().catch(() => undefined);
          }

          if (response.status === 401) {
            throw new AppError(
              ERROR_CODE.PROVIDER_AUTH_INVALID,
              `Provider rejected API token (401) on ${req.path}`,
              { status: HTTP_STATUS.BAD_REQUEST, details },
            );
          }
          if (response.status === 403) {
            throw new AppError(
              ERROR_CODE.PROVIDER_PERMISSION_MISSING,
              `Provider token lacks required permissions (403) on ${req.path}`,
              { status: HTTP_STATUS.FORBIDDEN, details },
            );
          }
          if (response.status === 429) {
            throw new AppError(
              ERROR_CODE.PROVIDER_RATE_LIMITED,
              `Provider rate limit exceeded (429) on ${req.path}`,
              { status: HTTP_STATUS.TOO_MANY_REQUESTS, details },
            );
          }
          throw new AppError(
            ERROR_CODE.PROVIDER_UPSTREAM_ERROR,
            `Provider returned HTTP ${response.status} on ${method} ${req.path}`,
            { status: HTTP_STATUS.BAD_GATEWAY, details },
          );
        }

        if (req.rawText) {
          const text = await response.text();
          return (req.schema ? req.schema.parse(text) : text) as T;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const text = await response.text();
        if (!text || !text.trim()) {
          return undefined as T;
        }

        const json = JSON.parse(text);
        return req.schema ? req.schema.parse(json) : (json as T);
      }

      throw new AppError(ERROR_CODE.PROVIDER_UPSTREAM_ERROR, 'Exhausted provider retries');
    },
  };
};
