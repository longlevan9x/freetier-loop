import { type IdPrefix, newId } from '@freetier-loop/shared';
import { integer, text } from 'drizzle-orm/sqlite-core';

export const primaryId = (prefix: IdPrefix) =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId(prefix));

export const timestamps = () => ({
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});
