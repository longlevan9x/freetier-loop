import { z } from 'zod';
import {
  ACCOUNT_STATUS_VALUES,
  PROVIDER_VALUES,
  VERCEL_ACCOUNT_TYPE_VALUES,
} from '../constants/providers';

export const quotaConfigSchema = z.object({
  warnRatio: z.number().min(0.1).max(1).default(0.8),
  customDailyLimit: z.number().int().positive().optional(),
});

export type QuotaConfig = z.infer<typeof quotaConfigSchema>;

export const createProviderAccountSchema = z.object({
  provider: z.enum(PROVIDER_VALUES),
  label: z.string().trim().min(1).max(80),
  externalAccountId: z.string().trim().min(1).max(120).optional(),
  apiToken: z.string().trim().min(10).max(512),
  quotaConfig: quotaConfigSchema.optional(),
});

export type CreateProviderAccountInput = z.infer<typeof createProviderAccountSchema>;

export const updateProviderAccountSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  apiToken: z.string().trim().min(10).max(512).optional(),
  status: z.enum(ACCOUNT_STATUS_VALUES).optional(),
  quotaConfig: quotaConfigSchema.optional(),
});

export type UpdateProviderAccountInput = z.infer<typeof updateProviderAccountSchema>;

export const providerAccountDtoSchema = z.object({
  id: z.string(),
  provider: z.enum(PROVIDER_VALUES),
  label: z.string(),
  externalAccountId: z.string().nullable(),
  accountType: z.enum(VERCEL_ACCOUNT_TYPE_VALUES).nullable().optional(),
  tokenLast4: z.string().length(4),
  status: z.enum(ACCOUNT_STATUS_VALUES),
  scopesVerified: z.array(z.string()),
  quotaConfig: quotaConfigSchema.nullable(),
  lastVerifiedAt: z.number().nullable(),
  lastSyncedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ProviderAccountDto = z.infer<typeof providerAccountDtoSchema>;
