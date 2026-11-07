export const ID_PREFIX = {
  PROVIDER_ACCOUNT: 'pa',
  RESOURCE: 'res',
  USAGE_SNAPSHOT: 'usg',
  JOB: 'job',
  JOB_STEP: 'jst',
  JOB_EVENT: 'jev',
  SNAPSHOT: 'snp',
  AUDIT_LOG: 'aud',
  LOGIN_ATTEMPT: 'lga',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];
export const ID_PREFIX_VALUES = Object.values(ID_PREFIX) as [IdPrefix, ...IdPrefix[]];
