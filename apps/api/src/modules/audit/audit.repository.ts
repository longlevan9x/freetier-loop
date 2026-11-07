import { auditLogs, user } from '@freetier-loop/db';
import { ID_PREFIX, newId } from '@freetier-loop/shared';
import { desc, eq, lt } from 'drizzle-orm';
import type { AppDatabase } from '../../platform/db';

export type AuditLogRecord = {
  id: string;
  userId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: number;
};

export type CreateAuditLogInput = {
  userId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  nowMs?: number;
};

export class AuditRepository {
  constructor(private readonly db: AppDatabase) {}

  async insert(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const now = new Date(input.nowMs ?? Date.now());
    const id = newId(ID_PREFIX.AUDIT_LOG, now.getTime());
    let resolvedUserId: string | null = input.userId ?? null;
    if (resolvedUserId) {
      const existingUser = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, resolvedUserId))
        .limit(1);
      if (!existingUser[0]) {
        resolvedUserId = null;
      }
    }
    await this.db.insert(auditLogs).values({
      id,
      userId: resolvedUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta ?? null,
      ip: input.ip ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id,
      userId: resolvedUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta ?? null,
      ip: input.ip ?? null,
      createdAt: now.getTime(),
    };
  }

  async list(options: { limit: number; cursor?: string }): Promise<{
    items: AuditLogRecord[];
    nextCursor: string | null;
  }> {
    const cursorMs = options.cursor ? Number.parseInt(options.cursor, 10) : undefined;
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(
        cursorMs && !Number.isNaN(cursorMs)
          ? lt(auditLogs.createdAt, new Date(cursorMs))
          : undefined,
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(options.limit + 1);

    const hasMore = rows.length > options.limit;
    const slice = hasMore ? rows.slice(0, options.limit) : rows;
    const lastRow = slice[slice.length - 1];

    return {
      items: slice.map((r) => ({
        id: r.id,
        userId: r.userId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        meta: r.meta,
        ip: r.ip,
        createdAt: r.createdAt.getTime(),
      })),
      nextCursor: hasMore && lastRow ? String(lastRow.createdAt.getTime()) : null,
    };
  }
}
