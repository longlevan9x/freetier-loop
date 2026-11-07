import { snapshots } from '@freetier-loop/db';
import { ID_PREFIX, type ResourceKind, newId } from '@freetier-loop/shared';
import { desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../platform/db';

export type SnapshotRecord = {
  id: string;
  jobId: string | null;
  resourceId: string;
  resourceName: string;
  kind: ResourceKind;
  payload: Record<string, unknown>;
  bindZoneFile: string | null;
  createdAt: number;
};

export class SnapshotsRepository {
  constructor(private readonly db: AppDatabase) {}

  private toRecord(row: typeof snapshots.$inferSelect): SnapshotRecord {
    return {
      id: row.id,
      jobId: row.jobId ?? null,
      resourceId: row.resourceId,
      resourceName: row.resourceName,
      kind: row.kind,
      payload: row.payload,
      bindZoneFile: row.bindZoneFile ?? null,
      createdAt: row.createdAt.getTime(),
    };
  }

  async create(input: {
    jobId?: string | null;
    resourceId: string;
    resourceName: string;
    kind: ResourceKind;
    payload: Record<string, unknown>;
    bindZoneFile?: string | null;
    nowMs: number;
  }): Promise<SnapshotRecord> {
    const now = new Date(input.nowMs);
    const id = newId(ID_PREFIX.SNAPSHOT, input.nowMs);
    await this.db.insert(snapshots).values({
      id,
      jobId: input.jobId ?? null,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      kind: input.kind,
      payload: input.payload,
      bindZoneFile: input.bindZoneFile ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return {
      id,
      jobId: input.jobId ?? null,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      kind: input.kind,
      payload: input.payload,
      bindZoneFile: input.bindZoneFile ?? null,
      createdAt: input.nowMs,
    };
  }

  async findById(id: string): Promise<SnapshotRecord | null> {
    const rows = await this.db.select().from(snapshots).where(eq(snapshots.id, id)).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async listByResourceId(resourceId: string): Promise<SnapshotRecord[]> {
    const rows = await this.db
      .select()
      .from(snapshots)
      .where(eq(snapshots.resourceId, resourceId))
      .orderBy(desc(snapshots.createdAt));
    return rows.map((r) => this.toRecord(r));
  }

  async listAll(limit = 50): Promise<SnapshotRecord[]> {
    const rows = await this.db
      .select()
      .from(snapshots)
      .orderBy(desc(snapshots.createdAt))
      .limit(limit);
    return rows.map((r) => this.toRecord(r));
  }
}
