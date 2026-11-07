import { resources } from '@freetier-loop/db';
import {
  ID_PREFIX,
  type ListResourcesQuery,
  type ResourceDto,
  type ResourceKind,
  newId,
} from '@freetier-loop/shared';
import { and, desc, eq, like, lt } from 'drizzle-orm';
import type { AppDatabase } from '../../platform/db';

export type UpsertResourceInput = {
  providerAccountId: string;
  kind: ResourceKind;
  externalId: string;
  name: string;
  parentId?: string | null;
  data?: Record<string, unknown>;
  nowMs?: number;
};

export class ResourcesRepository {
  constructor(private readonly db: AppDatabase) {}

  private toDto(row: typeof resources.$inferSelect): ResourceDto {
    return {
      id: row.id,
      providerAccountId: row.providerAccountId,
      kind: row.kind,
      externalId: row.externalId,
      name: row.name,
      parentId: row.parentId ?? null,
      data: row.data ?? {},
      syncedAt: row.syncedAt.getTime(),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async upsert(input: UpsertResourceInput): Promise<ResourceDto> {
    const now = new Date(input.nowMs ?? Date.now());
    const existingRows = await this.db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.providerAccountId, input.providerAccountId),
          eq(resources.kind, input.kind),
          eq(resources.externalId, input.externalId),
        ),
      )
      .limit(1);

    const existing = existingRows[0];
    if (existing) {
      await this.db
        .update(resources)
        .set({
          name: input.name,
          parentId: input.parentId ?? null,
          data: input.data ?? {},
          syncedAt: now,
          updatedAt: now,
        })
        .where(eq(resources.id, existing.id));

      return {
        id: existing.id,
        providerAccountId: existing.providerAccountId,
        kind: existing.kind,
        externalId: existing.externalId,
        name: input.name,
        parentId: input.parentId ?? null,
        data: input.data ?? {},
        syncedAt: now.getTime(),
        createdAt: existing.createdAt.getTime(),
        updatedAt: now.getTime(),
      };
    }

    const id = newId(ID_PREFIX.RESOURCE, now.getTime());
    await this.db.insert(resources).values({
      id,
      providerAccountId: input.providerAccountId,
      kind: input.kind,
      externalId: input.externalId,
      name: input.name,
      parentId: input.parentId ?? null,
      data: input.data ?? {},
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      providerAccountId: input.providerAccountId,
      kind: input.kind,
      externalId: input.externalId,
      name: input.name,
      parentId: input.parentId ?? null,
      data: input.data ?? {},
      syncedAt: now.getTime(),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    };
  }

  async findById(id: string): Promise<ResourceDto | null> {
    const rows = await this.db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return rows[0] ? this.toDto(rows[0]) : null;
  }

  async listByParentId(parentId: string): Promise<ResourceDto[]> {
    const rows = await this.db
      .select()
      .from(resources)
      .where(eq(resources.parentId, parentId))
      .orderBy(desc(resources.createdAt));
    return rows.map((r) => this.toDto(r));
  }

  async list(query: ListResourcesQuery): Promise<{
    items: ResourceDto[];
    nextCursor: string | null;
  }> {
    const conditions = [];
    if (query.accountId) {
      conditions.push(eq(resources.providerAccountId, query.accountId));
    }
    if (query.kind) {
      conditions.push(eq(resources.kind, query.kind));
    }
    if (query.parentId) {
      conditions.push(eq(resources.parentId, query.parentId));
    }
    if (query.q) {
      conditions.push(like(resources.name, `%${query.q}%`));
    }
    if (query.cursor) {
      const cursorMs = Number.parseInt(query.cursor, 10);
      if (!Number.isNaN(cursorMs)) {
        conditions.push(lt(resources.createdAt, new Date(cursorMs)));
      }
    }

    const rows = await this.db
      .select()
      .from(resources)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(resources.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;
    const last = slice[slice.length - 1];

    return {
      items: slice.map((r) => this.toDto(r)),
      nextCursor: hasMore && last ? String(last.createdAt.getTime()) : null,
    };
  }

  async updateData(id: string, data: Record<string, unknown>, nowMs: number): Promise<void> {
    await this.db
      .update(resources)
      .set({ data, updatedAt: new Date(nowMs) })
      .where(eq(resources.id, id));
  }
}
