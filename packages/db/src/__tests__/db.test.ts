import { ID_PREFIX } from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { newId, primaryId, timestamps } from '../index';

describe('@freetier-loop/db', () => {
  it('provides primaryId and timestamps helpers', () => {
    const idCol = primaryId(ID_PREFIX.JOB);
    const tsCols = timestamps();
    expect(idCol).toBeDefined();
    expect(tsCols.createdAt).toBeDefined();
    expect(tsCols.updatedAt).toBeDefined();
    expect(newId(ID_PREFIX.JOB).startsWith('job_')).toBe(true);
  });
});
