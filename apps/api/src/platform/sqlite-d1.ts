import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite';
import * as schema from '@freetier-loop/db';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import type { D1Binding } from './db';

const requireNode = createRequire(import.meta.url);
const { DatabaseSync } = requireNode('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

export type AppDatabase = DrizzleD1Database<typeof schema>;

class BoundStatement {
  constructor(
    private readonly db: DatabaseSyncType,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): BoundStatement {
    const normalized = values.map((v) => {
      if (v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Date) return v.getTime();
      return v as SQLInputValue;
    });
    return new BoundStatement(this.db, this.sql, normalized);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const isReader = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN|\bRETURNING\b)/i.test(this.sql);
    if (isReader) {
      const results = stmt.all(...this.params) as unknown as T[];
      return {
        results,
        success: true,
        meta: {
          duration: 0,
          size_after: 0,
          rows_read: results.length,
          rows_written: 0,
          last_row_id: 0,
          changed_db: false,
          changes: 0,
        },
      };
    }
    const info = stmt.run(...this.params);
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        changed_db: Number(info.changes) > 0,
        changes: Number(info.changes),
      },
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.all<T>();
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const stmt = this.db.prepare(this.sql);
    const isReader = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN|\bRETURNING\b)/i.test(this.sql);
    if (!isReader) {
      stmt.run(...this.params);
      return [];
    }
    const rows = stmt.all(...this.params) as Record<string, unknown>[];
    if (rows.length === 0) return [];
    const firstRow = rows[0] ?? {};
    const keys = Object.keys(firstRow);
    const values = rows.map((row) => keys.map((k) => row[k])) as unknown as T[];
    if (options?.columnNames) {
      return [keys as unknown as T, ...values];
    }
    return values;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName !== undefined) {
      return (row[colName] as T) ?? null;
    }
    return row as unknown as T;
  }
}

export const createSqliteD1Binding = (filename = ':memory:'): D1Binding => {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const d1 = {
    prepare(query: string) {
      return new BoundStatement(sqlite, query) as unknown as D1PreparedStatement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN');
      try {
        const results: D1Result<T>[] = [];
        for (const stmt of statements) {
          const res = await (stmt as unknown as BoundStatement).all<T>();
          results.push(res);
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string): Promise<D1ExecResult> {
      const statements = query
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const s of statements) {
        sqlite.exec(s);
      }
      return { count: statements.length, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
    withSession(): D1DatabaseSession {
      return d1 as unknown as D1DatabaseSession;
    },
  };

  return d1 as unknown as D1Binding;
};

const INITIAL_MIGRATION_PATH = resolve(
  import.meta.dirname,
  '../../../../packages/db/migrations/0000_faithful_imperial_guard.sql',
);

export const applyMigrationsToD1 = async (d1: D1Binding): Promise<void> => {
  const sql = readFileSync(INITIAL_MIGRATION_PATH, 'utf8');
  await (d1 as unknown as { exec(q: string): Promise<unknown> }).exec(sql);
};

export const createAppDatabase = (d1: D1Binding): AppDatabase => drizzle(d1, { schema });

export const createInMemoryDatabase = async (): Promise<{
  d1: D1Binding;
  db: AppDatabase;
}> => {
  const d1 = createSqliteD1Binding(':memory:');
  await applyMigrationsToD1(d1);
  const db = createAppDatabase(d1);
  return { d1, db };
};
