import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export interface BackupResult {
  sql: string;
  tableCount: number;
  rowCount: number;
}

/**
 * Exports all user tables and rows from a SQLite / D1-compatible database into deterministic SQL statements,
 * and supports restoring that SQL dump into a fresh SQLite database (T-114).
 */
export function exportSqliteDatabase(sqlitePath: string): BackupResult {
  const db = new DatabaseSync(sqlitePath);
  try {
    const tables = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name ASC",
      )
      .all() as Array<{ name: string; sql: string | null }>;

    const statements: string[] = [
      '-- freetier-loop D1 / SQLite backup dump',
      'PRAGMA foreign_keys=OFF;',
    ];
    let totalRows = 0;

    for (const table of tables) {
      if (!table.sql) continue;
      statements.push(`${table.sql.replace(/^CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS')};`);

      const rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Array<
        Record<string, unknown>
      >;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const colNames = cols.map((c) => `"${c}"`).join(', ');
        const colVals = cols
          .map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(', ');
        statements.push(
          `INSERT OR REPLACE INTO "${table.name}" (${colNames}) VALUES (${colVals});`,
        );
        totalRows += 1;
      }
    }

    statements.push('PRAGMA foreign_keys=ON;');
    return {
      sql: `${statements.join('\n')}\n`,
      tableCount: tables.length,
      rowCount: totalRows,
    };
  } finally {
    db.close();
  }
}

export function restoreSqliteDatabase(targetSqlitePath: string, sqlDump: string): void {
  const dir = dirname(targetSqlitePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(targetSqlitePath);
  try {
    db.exec(sqlDump);
  } finally {
    db.close();
  }
}

function parseCliArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const isMainModule =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1] ?? '')).href === import.meta.url;

if (isMainModule) {
  const args = parseCliArgs(process.argv.slice(2));
  const action = typeof args.action === 'string' ? args.action : 'export';
  const outputPath = resolve(
    typeof args.out === 'string' ? args.out : `./backups/d1-backup-${Date.now()}.sql`,
  );

  if (args.remote === true) {
    const dbName = typeof args.db === 'string' ? args.db : 'freetier-loop-db';
    mkdirSync(dirname(outputPath), { recursive: true });
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@freetier-loop/api',
        'exec',
        'wrangler',
        'd1',
        'export',
        dbName,
        '--remote',
        '--output',
        outputPath,
      ],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
  } else if (action === 'restore') {
    const inputPath = resolve(typeof args.in === 'string' ? args.in : outputPath);
    const targetDb = resolve(
      typeof args.sqlite === 'string' ? args.sqlite : './.wrangler/restored.sqlite',
    );
    const sqlDump = readFileSync(inputPath, 'utf8');
    restoreSqliteDatabase(targetDb, sqlDump);
  } else {
    const sourceDb = resolve(
      typeof args.sqlite === 'string' ? args.sqlite : './.wrangler/local.sqlite',
    );
    mkdirSync(dirname(outputPath), { recursive: true });
    const dump = exportSqliteDatabase(sourceDb);
    writeFileSync(outputPath, dump.sql, 'utf8');
  }
}
