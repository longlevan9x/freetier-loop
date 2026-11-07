import { account, loginAttempts, rateLimit, session, user } from '@freetier-loop/db';
import {
  AUTH,
  AUTH_RATE_LIMIT,
  AppError,
  ERROR_CODE,
  HTTP_STATUS,
  ID_PREFIX,
  newId,
} from '@freetier-loop/shared';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import type { AppConfig } from '../../config/env.schema';
import type { AppDatabase } from '../../platform/db';
import type { Clock } from '../../platform/deps';
import type { PasswordHasher } from '../../platform/password-hasher';
import { generateOtpAuthUri, generateTotpSecret, verifyTotpCode } from '../../platform/totp';
import type { SessionUser } from '../../types';
import type { AuditService } from '../audit/audit.service';

export const SESSION_COOKIE_NAME = 'better-auth.session_token' as const;

export type SignInInput = {
  email: string;
  password: string;
  captchaToken: string | undefined;
  ip: string;
  country: string;
  userAgent: string;
  twoFactorCode?: string | undefined;
};

export type SignInResult =
  | {
      requiresTwoFactor: false;
      token: string;
      expiresAtMs: number;
      user: SessionUser;
    }
  | {
      requiresTwoFactor: true;
      reason: 'new_device' | 'new_ip' | 'always_required';
      ip: string;
      country: string;
      userAgent: string;
    };

export type SessionItem = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  createdAt: number;
  expiresAt: number;
  isCurrent: boolean;
};

export type SeedAdminInput = {
  email: string;
  password: string;
  name?: string;
};

export class AuthService {
  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly auditService: AuditService,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async seedAdmin(input: SeedAdminInput): Promise<SessionUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const now = new Date(this.clock.nowMs());
    const passwordHash = await this.hasher.hash(input.password);

    const existingUsers = await this.db
      .select()
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    const existing = existingUsers[0];
    if (existing) {
      await this.db
        .update(user)
        .set({
          name: input.name ?? existing.name,
          updatedAt: now,
        })
        .where(eq(user.id, existing.id));

      await this.db
        .update(account)
        .set({
          password: passwordHash,
          updatedAt: now,
        })
        .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential')));

      return {
        id: existing.id,
        email: existing.email,
        name: input.name ?? existing.name,
      };
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const accountRowId = `acc_${crypto.randomUUID().replace(/-/g, '')}`;
    const displayName = input.name ?? (normalizedEmail.split('@')[0] || 'Admin');

    await this.db.insert(user).values({
      id: userId,
      name: displayName,
      email: normalizedEmail,
      emailVerified: true,
      banned: false,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.db.insert(account).values({
      id: accountRowId,
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: userId,
      email: normalizedEmail,
      name: displayName,
    };
  }

  private async verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
    if (!token || token.trim().length === 0) {
      throw new AppError(
        ERROR_CODE.AUTH_CAPTCHA_FAILED,
        'Missing Cloudflare Turnstile verification token',
      );
    }

    const form = new URLSearchParams();
    form.set('secret', this.config.TURNSTILE_SECRET_KEY);
    form.set('response', token);
    if (ip) {
      form.set('remoteip', ip);
    }

    const res = await this.fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      throw new AppError(ERROR_CODE.AUTH_CAPTCHA_FAILED, 'Turnstile upstream error');
    }
    const payload = (await res.json()) as { success?: boolean };
    if (!payload.success) {
      throw new AppError(ERROR_CODE.AUTH_CAPTCHA_FAILED, 'Turnstile verification failed');
    }
  }

  private async checkSignInRateLimit(ip: string): Promise<void> {
    const key = `signin:${ip || 'local'}`;
    const nowMs = this.clock.nowMs();
    const windowMs = AUTH_RATE_LIMIT.SIGN_IN_WINDOW_SECONDS * 1000;

    const rows = await this.db.select().from(rateLimit).where(eq(rateLimit.key, key)).limit(1);
    const existing = rows[0];

    if (!existing) {
      await this.db.insert(rateLimit).values({
        id: `rl_${crypto.randomUUID().replace(/-/g, '')}`,
        key,
        count: 1,
        lastRequest: nowMs,
      });
      return;
    }

    if (nowMs - existing.lastRequest >= windowMs) {
      await this.db
        .update(rateLimit)
        .set({ count: 1, lastRequest: nowMs })
        .where(eq(rateLimit.id, existing.id));
      return;
    }

    if (existing.count >= AUTH_RATE_LIMIT.SIGN_IN_MAX_REQUESTS) {
      throw new AppError(
        ERROR_CODE.AUTH_RATE_LIMITED,
        'Too many sign-in attempts. Please wait a minute.',
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    await this.db
      .update(rateLimit)
      .set({ count: existing.count + 1, lastRequest: nowMs })
      .where(eq(rateLimit.id, existing.id));
  }

  private isEmailAllowlisted(email: string): boolean {
    if (this.config.ADMIN_EMAILS.length === 0) {
      return true;
    }
    return this.config.ADMIN_EMAILS.some(
      (allowed) => allowed.toLowerCase() === email.toLowerCase(),
    );
  }

  private async recordFailedAttempt(email: string, ip: string): Promise<void> {
    const nowMs = this.clock.nowMs();
    const now = new Date(nowMs);
    const rows = await this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email))
      .limit(1);
    const existing = rows[0];
    const nextCount = (existing?.failedCount ?? 0) + 1;
    const lockedUntil =
      nextCount >= AUTH.LOGIN_MAX_FAILURES
        ? new Date(nowMs + AUTH.LOGIN_LOCK_MINUTES * 60 * 1000)
        : null;

    if (!existing) {
      await this.db.insert(loginAttempts).values({
        id: newId(ID_PREFIX.LOGIN_ATTEMPT, nowMs),
        email,
        ip,
        failedCount: nextCount,
        lockedUntil,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await this.db
        .update(loginAttempts)
        .set({
          ip,
          failedCount: nextCount,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(loginAttempts.id, existing.id));
    }
  }

  async signInEmail(input: SignInInput): Promise<SignInResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const nowMs = this.clock.nowMs();

    await this.checkSignInRateLimit(input.ip);
    if (!input.twoFactorCode || input.captchaToken) {
      await this.verifyTurnstile(input.captchaToken, input.ip);
    }

    if (!this.isEmailAllowlisted(normalizedEmail)) {
      await this.auditService.record({
        action: 'auth.sign_in.blocked_allowlist',
        targetType: 'user',
        targetId: normalizedEmail,
        ip: input.ip,
      });
      throw new AppError(
        ERROR_CODE.AUTH_NOT_ALLOWED,
        'This email is not authorized to access the admin console',
        { status: HTTP_STATUS.FORBIDDEN },
      );
    }

    const attemptRows = await this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, normalizedEmail))
      .limit(1);
    const attempt = attemptRows[0];
    if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > nowMs) {
      throw new AppError(
        ERROR_CODE.AUTH_LOCKED,
        'Account is temporarily locked due to repeated failed sign-in attempts',
        { status: HTTP_STATUS.LOCKED },
      );
    }

    const userRows = await this.db
      .select()
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);
    const foundUser = userRows[0];
    if (!foundUser || foundUser.banned) {
      await this.recordFailedAttempt(normalizedEmail, input.ip);
      throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Invalid email or password', {
        status: HTTP_STATUS.UNAUTHORIZED,
      });
    }

    const accRows = await this.db
      .select()
      .from(account)
      .where(and(eq(account.userId, foundUser.id), eq(account.providerId, 'credential')))
      .limit(1);
    const credAccount = accRows[0];

    if (!credAccount?.password) {
      await this.recordFailedAttempt(normalizedEmail, input.ip);
      throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Invalid email or password', {
        status: HTTP_STATUS.UNAUTHORIZED,
      });
    }

    const validPassword = await this.hasher.verify({
      hash: credAccount.password,
      password: input.password,
    });

    if (!validPassword) {
      await this.recordFailedAttempt(normalizedEmail, input.ip);
      await this.auditService.record({
        userId: foundUser.id,
        action: 'auth.sign_in.failed',
        targetType: 'user',
        targetId: foundUser.id,
        ip: input.ip,
      });
      const updatedAttempt = await this.db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.email, normalizedEmail))
        .limit(1);
      if (updatedAttempt[0]?.lockedUntil && updatedAttempt[0].lockedUntil.getTime() > nowMs) {
        throw new AppError(
          ERROR_CODE.AUTH_LOCKED,
          'Account is temporarily locked due to repeated failed sign-in attempts',
          { status: HTTP_STATUS.LOCKED },
        );
      }
      throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Invalid email or password', {
        status: HTTP_STATUS.UNAUTHORIZED,
      });
    }

    if (attempt) {
      await this.db
        .update(loginAttempts)
        .set({
          failedCount: 0,
          lockedUntil: null,
          updatedAt: new Date(nowMs),
        })
        .where(eq(loginAttempts.id, attempt.id));
    }

    // 2FA check (Adaptive or Always)
    if (foundUser.twoFactorEnabled && foundUser.twoFactorSecret) {
      const priorSessions = await this.db
        .select()
        .from(session)
        .where(eq(session.userId, foundUser.id))
        .limit(50);

      const isKnownIp = priorSessions.some((s) => s.ipAddress === input.ip);
      const isKnownDevice = priorSessions.some((s) => s.userAgent === input.userAgent);
      const isAdaptiveChallengeNeeded = !isKnownIp || !isKnownDevice;
      const mustChallenge = Boolean(foundUser.twoFactorAlways) || isAdaptiveChallengeNeeded;

      if (mustChallenge) {
        if (!input.twoFactorCode) {
          const reason: 'new_device' | 'new_ip' | 'always_required' = foundUser.twoFactorAlways
            ? 'always_required'
            : !isKnownDevice
              ? 'new_device'
              : 'new_ip';

          await this.auditService.record({
            userId: foundUser.id,
            action: 'auth.2fa.challenge_issued',
            targetType: 'user',
            targetId: foundUser.id,
            ip: input.ip,
            meta: { reason, country: input.country, userAgent: input.userAgent },
          });

          return {
            requiresTwoFactor: true,
            reason,
            ip: input.ip,
            country: input.country,
            userAgent: input.userAgent,
          };
        }

        const valid2fa = await verifyTotpCode(foundUser.twoFactorSecret, input.twoFactorCode);
        if (!valid2fa) {
          await this.recordFailedAttempt(normalizedEmail, input.ip);
          await this.auditService.record({
            userId: foundUser.id,
            action: 'auth.2fa.failed',
            targetType: 'user',
            targetId: foundUser.id,
            ip: input.ip,
          });
          throw new AppError(
            ERROR_CODE.AUTH_INVALID_2FA,
            'Invalid or expired 2FA code. Please check your authenticator app.',
            { status: HTTP_STATUS.UNAUTHORIZED },
          );
        }
      }
    }

    const token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresAtMs = nowMs + AUTH.SESSION_TTL_SECONDS * 1000;
    const now = new Date(nowMs);

    await this.db.insert(session).values({
      id: `ses_${crypto.randomUUID().replace(/-/g, '')}`,
      token,
      userId: foundUser.id,
      expiresAt: new Date(expiresAtMs),
      ipAddress: input.ip,
      userAgent: input.userAgent,
      country: input.country,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditService.record({
      userId: foundUser.id,
      action: 'auth.sign_in.succeeded',
      targetType: 'user',
      targetId: foundUser.id,
      ip: input.ip,
      meta: {
        country: input.country,
        userAgent: input.userAgent,
        twoFactorVerified: Boolean(input.twoFactorCode),
      },
    });

    return {
      requiresTwoFactor: false,
      token,
      expiresAtMs,
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
      },
    };
  }

  async get2faStatus(userId: string): Promise<{ enabled: boolean; always: boolean }> {
    const rows = await this.db
      .select({
        enabled: user.twoFactorEnabled,
        always: user.twoFactorAlways,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const u = rows[0];
    if (!u) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'User not found');
    }
    return {
      enabled: Boolean(u.enabled),
      always: Boolean(u.always),
    };
  }

  async setup2fa(userId: string): Promise<{ secret: string; uri: string; otpauthUri: string }> {
    const rows = await this.db.select().from(user).where(eq(user.id, userId)).limit(1);
    const u = rows[0];
    if (!u) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'User not found');
    }

    const secret = generateTotpSecret();
    const uri = generateOtpAuthUri(u.email, secret);

    await this.db
      .update(user)
      .set({
        twoFactorSecret: secret,
        updatedAt: new Date(this.clock.nowMs()),
      })
      .where(eq(user.id, userId));

    return { secret, uri, otpauthUri: uri };
  }

  async enable2fa(userId: string, code: string, always = false): Promise<void> {
    const rows = await this.db.select().from(user).where(eq(user.id, userId)).limit(1);
    const u = rows[0];
    if (!u || !u.twoFactorSecret) {
      throw new AppError(
        ERROR_CODE.VALIDATION_ERROR,
        'Please initiate 2FA setup first before enabling',
      );
    }

    const valid = await verifyTotpCode(u.twoFactorSecret, code);
    if (!valid) {
      throw new AppError(
        ERROR_CODE.AUTH_INVALID_2FA,
        'Invalid 2FA code. Please check your authenticator app and try again.',
      );
    }

    const now = new Date(this.clock.nowMs());
    await this.db
      .update(user)
      .set({
        twoFactorEnabled: true,
        twoFactorAlways: always,
        updatedAt: now,
      })
      .where(eq(user.id, userId));

    await this.auditService.record({
      userId,
      action: 'auth.2fa.enabled',
      targetType: 'user',
      targetId: userId,
      meta: { always },
    });
  }

  async disable2fa(userId: string, password: string): Promise<void> {
    const rows = await this.db
      .select({
        userId: user.id,
        passwordHash: account.password,
      })
      .from(user)
      .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
      .where(eq(user.id, userId))
      .limit(1);

    const u = rows[0];
    if (!u || !u.passwordHash) {
      throw new AppError(ERROR_CODE.NOT_FOUND, 'User credential account not found');
    }

    const valid = await this.hasher.verify({
      hash: u.passwordHash,
      password,
    });
    if (!valid) {
      throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Incorrect admin password');
    }

    const now = new Date(this.clock.nowMs());
    await this.db
      .update(user)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorAlways: false,
        updatedAt: now,
      })
      .where(eq(user.id, userId));

    await this.auditService.record({
      userId,
      action: 'auth.2fa.disabled',
      targetType: 'user',
      targetId: userId,
    });
  }

  async listSessions(userId: string, currentToken?: string): Promise<SessionItem[]> {
    const now = new Date(this.clock.nowMs());
    const rows = await this.db
      .select()
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
      .orderBy(desc(session.createdAt));

    return rows.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      country: s.country,
      createdAt: s.createdAt.getTime(),
      expiresAt: s.expiresAt.getTime(),
      isCurrent: Boolean(currentToken && s.token === currentToken),
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.db.delete(session).where(and(eq(session.id, sessionId), eq(session.userId, userId)));

    await this.auditService.record({
      userId,
      action: 'auth.session.revoked',
      targetType: 'session',
      targetId: sessionId,
    });
  }

  async revokeOtherSessions(userId: string, currentToken: string): Promise<void> {
    await this.db
      .delete(session)
      .where(and(eq(session.userId, userId), ne(session.token, currentToken)));

    await this.auditService.record({
      userId,
      action: 'auth.session.revoke_others',
      targetType: 'user',
      targetId: userId,
    });
  }

  async getSessionByToken(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const nowMs = this.clock.nowMs();
    const rows = await this.db
      .select({
        sessionExpiresAt: session.expiresAt,
        userId: user.id,
        email: user.email,
        name: user.name,
        banned: user.banned,
      })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(eq(session.token, token))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    if (row.banned || row.sessionExpiresAt.getTime() <= nowMs) {
      return null;
    }
    if (!this.isEmailAllowlisted(row.email)) {
      return null;
    }

    return {
      id: row.userId,
      email: row.email,
      name: row.name,
    };
  }

  async signOutByToken(token: string | undefined, ip?: string): Promise<void> {
    if (!token) return;
    const sessionUser = await this.getSessionByToken(token);
    await this.db.delete(session).where(eq(session.token, token));
    if (sessionUser) {
      await this.auditService.record({
        userId: sessionUser.id,
        action: 'auth.sign_out',
        targetType: 'user',
        targetId: sessionUser.id,
        ip: ip ?? null,
      });
    }
  }
}
