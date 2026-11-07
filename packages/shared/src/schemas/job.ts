import { z } from 'zod';
import { ERROR_CODE_VALUES } from '../constants/errors';
import {
  JOB_EVENT_LEVEL_VALUES,
  JOB_STATUS_VALUES,
  MIGRATION_TEMPLATE_VALUES,
  STEP_STATUS_VALUES,
} from '../constants/job';

export const createJobSchema = z.object({
  template: z.enum(MIGRATION_TEMPLATE_VALUES),
  sourceAccountId: z.string().min(1),
  targetAccountId: z.string().min(1),
  resourceId: z.string().min(1),
  input: z.record(z.unknown()).default({}),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const confirmJobSchema = z.object({
  confirm: z.string().trim().min(1),
});

export type ConfirmJobInput = z.infer<typeof confirmJobSchema>;

export const manualStepInputSchema = z.object({
  values: z.record(z.string()).default({}),
  acknowledged: z.boolean().default(true),
});

export type ManualStepInput = z.infer<typeof manualStepInputSchema>;

export const jobStepDtoSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  position: z.number().int().nonnegative(),
  type: z.string(),
  title: z.string(),
  destructive: z.boolean(),
  status: z.enum(STEP_STATUS_VALUES),
  cursor: z.record(z.unknown()).nullable(),
  result: z.record(z.unknown()).nullable(),
  errorCode: z.enum(ERROR_CODE_VALUES).nullable(),
  errorMessage: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type JobStepDto = z.infer<typeof jobStepDtoSchema>;

export const jobDtoSchema = z.object({
  id: z.string(),
  template: z.enum(MIGRATION_TEMPLATE_VALUES),
  status: z.enum(JOB_STATUS_VALUES),
  sourceAccountId: z.string(),
  targetAccountId: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  input: z.record(z.unknown()),
  plan: z.record(z.unknown()).nullable(),
  confirmedAt: z.number().nullable(),
  createdBy: z.string(),
  version: z.number().int().nonnegative(),
  steps: z.array(jobStepDtoSchema).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type JobDto = z.infer<typeof jobDtoSchema>;

export const jobEventDtoSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stepId: z.string().nullable(),
  level: z.enum(JOB_EVENT_LEVEL_VALUES),
  message: z.string(),
  data: z.record(z.unknown()).nullable(),
  createdAt: z.number(),
});

export type JobEventDto = z.infer<typeof jobEventDtoSchema>;
