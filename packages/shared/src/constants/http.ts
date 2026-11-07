export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export const HEADER = {
  REQUEST_ID: 'x-request-id',
  CAPTCHA: 'x-captcha-response',
  RETRY_AFTER: 'retry-after',
  CONTENT_TYPE: 'content-type',
  AUTHORIZATION: 'authorization',
} as const;

export type HeaderName = (typeof HEADER)[keyof typeof HEADER];
