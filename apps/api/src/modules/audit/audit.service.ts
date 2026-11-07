import type { Clock } from '../../platform/deps';
import type { AuditLogRecord, AuditRepository, CreateAuditLogInput } from './audit.repository';

export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async record(input: Omit<CreateAuditLogInput, 'nowMs'>): Promise<AuditLogRecord> {
    return this.repo.insert({
      ...input,
      nowMs: this.clock.nowMs(),
    });
  }

  async list(options: { limit: number; cursor?: string }) {
    return this.repo.list(options);
  }
}
