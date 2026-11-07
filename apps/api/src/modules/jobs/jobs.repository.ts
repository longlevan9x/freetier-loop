import { jobEvents, jobSteps, jobs } from '@freetier-loop/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import type {
  JobEventInsert,
  JobEventRow,
  JobInsert,
  JobRow,
  JobStepInsert,
  JobStepRow,
} from '../../jobs/job.types';
import type { AppDatabase } from '../../platform/db';

export class JobsRepository {
  constructor(private readonly db: AppDatabase) {}

  async createJob(row: JobInsert, steps: JobStepInsert[]): Promise<JobRow> {
    await this.db.insert(jobs).values(row);
    if (steps.length > 0) {
      await this.db.insert(jobSteps).values(steps);
    }
    const created = row.id ? await this.findById(row.id) : undefined;
    if (!created) {
      throw new Error('Failed to load created job');
    }
    return created;
  }

  async findById(id: string): Promise<JobRow | undefined> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return rows[0];
  }

  async listJobs(limit = 50): Promise<JobRow[]> {
    return this.db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
  }

  async listSteps(jobId: string): Promise<JobStepRow[]> {
    return this.db
      .select()
      .from(jobSteps)
      .where(eq(jobSteps.jobId, jobId))
      .orderBy(asc(jobSteps.position));
  }

  async findStepById(stepId: string): Promise<JobStepRow | undefined> {
    const rows = await this.db.select().from(jobSteps).where(eq(jobSteps.id, stepId)).limit(1);
    return rows[0];
  }

  async updateJobWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<Omit<JobInsert, 'id' | 'createdAt' | 'version'>>,
  ): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing || existing.version !== expectedVersion) {
      return false;
    }
    await this.db
      .update(jobs)
      .set({
        ...patch,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.version, expectedVersion)));
    return true;
  }

  async updateStep(
    stepId: string,
    patch: Partial<Omit<JobStepInsert, 'id' | 'jobId' | 'createdAt'>>,
  ): Promise<void> {
    await this.db
      .update(jobSteps)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(jobSteps.id, stepId));
  }

  async insertEvent(event: JobEventInsert): Promise<void> {
    await this.db.insert(jobEvents).values(event);
  }

  async listEvents(jobId: string): Promise<JobEventRow[]> {
    return this.db
      .select()
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(asc(jobEvents.createdAt));
  }
}
