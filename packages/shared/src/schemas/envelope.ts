import { z } from 'zod';
import { ERROR_CODE_VALUES } from '../constants/errors';

export const paginationMetaSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const createSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: paginationMetaSchema.optional(),
  });

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODE_VALUES),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const ok = <T>(data: T, meta?: PaginationMeta) =>
  meta !== undefined ? { data, meta } : { data };
