import crypto from 'node:crypto';
import { AUTH } from '@freetier-loop/shared';
import { account, user } from '../src/schema/auth';

const SCRYPT_PARAMS: crypto.ScryptOptions = {
  N: 8192,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

export const hashAdminPassword = (password: string): string => {
  if (password.length < AUTH.MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${AUTH.MIN_PASSWORD_LENGTH} characters long.`);
  }
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, 64, SCRYPT_PARAMS);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
};

export const buildSeedAdminSql = (input: {
  email: string;
  password: string;
  name?: string;
  nowMs?: number;
}): { userId: string; email: string; sqlStatements: string[] } => {
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? (email.split('@')[0] || 'Admin')).replace(/'/g, "''");
  const safeEmail = email.replace(/'/g, "''");
  const passwordHash = hashAdminPassword(input.password);
  const now = input.nowMs ?? Date.now();
  const userId = `usr_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
  const accountId = `acc_${crypto.createHash('sha256').update(`cred:${email}`).digest('hex').slice(0, 24)}`;

  const upsertUserSql = `INSERT INTO ${user ? 'user' : 'user'} (id, name, email, email_verified, banned, two_factor_enabled, created_at, updated_at)
VALUES ('${userId}', '${name}', '${safeEmail}', 1, 0, 0, ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at;`;

  const upsertAccountSql = `INSERT INTO ${account ? 'account' : 'account'} (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES ('${accountId}', '${userId}', 'credential', (SELECT id FROM user WHERE email = '${safeEmail}'), '${passwordHash}', ${now}, ${now})
ON CONFLICT(id) DO UPDATE SET password = excluded.password, updated_at = excluded.updated_at;`;

  return {
    userId,
    email,
    sqlStatements: [upsertUserSql, upsertAccountSql],
  };
};

const parseCliArgs = (argv: string[]) => {
  let email = '';
  let password = '';
  let name: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--email' && argv[i + 1]) {
      email = argv[++i] ?? '';
    } else if (arg === '--password' && argv[i + 1]) {
      password = argv[++i] ?? '';
    } else if (arg === '--name' && argv[i + 1]) {
      name = argv[++i];
    }
  }
  return { email, password, ...(name !== undefined ? { name } : {}) };
};

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    console.error(
      'Usage: pnpm db:seed:admin --email <email> --password <password> [--name <name>]',
    );
    process.exit(1);
  }
  const result = buildSeedAdminSql(args);
  console.log(`Generated idempotent admin seed SQL for ${result.email} (${result.userId}):`);
  for (const stmt of result.sqlStatements) {
    console.log(stmt);
  }
}
