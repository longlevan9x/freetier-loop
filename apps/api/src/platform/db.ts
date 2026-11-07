import * as schema from '@freetier-loop/db';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';

export type AppDatabase = DrizzleD1Database<typeof schema>;
export type D1Binding = Parameters<typeof drizzle>[0];

export const createAppDatabase = (d1: D1Binding): AppDatabase => drizzle(d1, { schema });

export const createNoopD1Binding = (): D1Binding => {
  const emptyResult = {
    results: [],
    success: true,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: false,
      changes: 0,
    },
  };
  const stmt = {
    bind: () => stmt,
    all: async () => emptyResult,
    run: async () => emptyResult,
    raw: async () => [],
    first: async () => null,
  };
  const d1 = {
    prepare: () => stmt,
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => d1,
  };
  return d1 as unknown as D1Binding;
};
