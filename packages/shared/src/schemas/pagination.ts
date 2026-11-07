import { z } from 'zod';
import { PAGINATION } from '../constants/limits';

export const cursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;
