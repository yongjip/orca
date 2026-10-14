import { z } from 'zod'

export { MERGETRAIN_RUNTIME_CAPABILITY } from './mergetrain-capability'
export const MERGETRAIN_CONTRACT_VERSION = 5

const JobSummary = z.object({
  id: z.number().int().positive(),
  branch: z.string(),
  task: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
  reason: z.string().nullable(),
  reason_code: z.string().nullable()
})

export const MergetrainStatusSchema = z.object({
  contract_version: z.literal(MERGETRAIN_CONTRACT_VERSION),
  ok: z.literal(true),
  health: z.string(),
  state: z.string(),
  summary: z.string(),
  counts: z.object({
    waiting: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    attention: z.number().int().nonnegative(),
    done: z.number().int().nonnegative()
  }),
  next_action: z.object({ code: z.string(), requires_approval: z.string() }),
  warnings: z.array(z.object({ code: z.string(), severity: z.string(), summary: z.string() })),
  attention_jobs: z.array(JobSummary),
  recent_jobs: z.array(JobSummary)
})

export const MergetrainJobSchema = z.object({
  id: z.number().int().positive(),
  branch: z.string(),
  task: z.string(),
  status: z.string()
})

export type MergetrainStatus = z.infer<typeof MergetrainStatusSchema>
export type MergetrainJob = z.infer<typeof MergetrainJobSchema>
export type MergetrainAction = 'enqueue' | 'validate'
export type MergetrainRequest =
  | { requestId: string; action: 'enqueue'; task: string; expectedBranch: string }
  | { requestId: string; action: 'validate' }

export type MergetrainCommandResult =
  | { kind: 'error'; code: string; message: string }
  | { kind: 'status'; status: MergetrainStatus }
  | { kind: 'enqueue'; job: MergetrainJob }
  | { kind: 'validate'; outcome: string; jobs: MergetrainJob[] }

export type MergetrainOperation = {
  requestId: string
  action: MergetrainAction
  state: 'running' | 'finished'
  result: MergetrainCommandResult | null
}

export type MergetrainSnapshot = {
  result: MergetrainCommandResult
  operation: MergetrainOperation | null
}

export function canMutateMergetrain(status: MergetrainStatus): boolean {
  return (
    status.health === 'healthy' &&
    ['idle', 'waiting', 'ready', 'attention'].includes(status.state) &&
    [
      'enqueue_clean_branch',
      'validate_queued_jobs',
      'deploy_when_approved',
      'fix_blocked_job'
    ].includes(status.next_action.code) &&
    ['none', 'runner', 'deploy'].includes(status.next_action.requires_approval)
  )
}
