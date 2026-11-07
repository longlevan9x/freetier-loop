import { ERROR_CODE, type ErrorCode } from '@freetier-loop/shared';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODE.INTERNAL_ERROR]: 'An unexpected server error occurred. Please try again.',
  [ERROR_CODE.VALIDATION_ERROR]: 'Please check the form fields and try again.',
  [ERROR_CODE.NOT_FOUND]: 'The requested resource was not found.',
  [ERROR_CODE.CONFLICT]: 'This resource conflicts with existing state.',
  [ERROR_CODE.AUTH_UNAUTHORIZED]: 'Invalid email or password.',
  [ERROR_CODE.AUTH_NOT_ALLOWED]: 'This account is not authorized to access the admin console.',
  [ERROR_CODE.AUTH_LOCKED]:
    'Account is temporarily locked after repeated failed sign-in attempts (15 minutes).',
  [ERROR_CODE.AUTH_CAPTCHA_FAILED]:
    'Cloudflare Turnstile verification failed. Please complete the challenge again.',
  [ERROR_CODE.AUTH_RATE_LIMITED]:
    'Too many sign-in attempts. Please wait 60 seconds before retrying.',
  [ERROR_CODE.PROVIDER_AUTH_INVALID]:
    'Provider API token is invalid or expired. Check permissions and try again.',
  [ERROR_CODE.PROVIDER_PERMISSION_MISSING]: 'Provider API token is missing required scopes.',
  [ERROR_CODE.PROVIDER_RATE_LIMITED]: 'Provider API rate limit reached. Retrying with backoff.',
  [ERROR_CODE.PROVIDER_UPSTREAM_ERROR]: 'Upstream provider API returned an error.',
  [ERROR_CODE.PROVIDER_TIMEOUT]: 'Provider API request timed out.',
  [ERROR_CODE.PROVIDER_BUDGET_EXCEEDED]:
    'Worker subrequest budget reached for this chunk; continue with next sync/step.',
  [ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED]:
    'This provider does not support the requested capability.',
  [ERROR_CODE.RESOURCE_SELF_PROTECTED]:
    'Self-Protection Guard: Cannot migrate or delete the domain/worker hosting this admin console.',
  [ERROR_CODE.CONFIRMATION_MISMATCH]:
    'Confirmation text does not match the exact resource or account name.',
  [ERROR_CODE.JOB_INVALID_STATE]: 'Job is not in a valid state for this operation.',
  [ERROR_CODE.JOB_STEP_FAILED]: 'Migration step failed. Check the timeline logs for details.',
  [ERROR_CODE.JOB_CONCURRENT_MODIFICATION]: 'Another operation is currently advancing this job.',
  [ERROR_CODE.CRYPTO_DECRYPT_FAILED]:
    'Failed to decrypt stored credential. Check ENCRYPTION_KEY configuration.',
};

export const formatApiError = (payload: unknown, fallback = 'Request failed'): string => {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const errObj = (payload as { error?: { code?: ErrorCode; message?: string } }).error;
    if (errObj?.code && errObj.code in ERROR_MESSAGES) {
      return `${ERROR_MESSAGES[errObj.code]} (${errObj.message ?? errObj.code})`;
    }
    if (errObj?.message) {
      return errObj.message;
    }
  }
  return fallback;
};
