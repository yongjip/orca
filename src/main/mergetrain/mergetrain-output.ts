import { z } from 'zod'
import {
  MERGETRAIN_CONTRACT_VERSION,
  MergetrainJobSchema,
  MergetrainStatusSchema,
  type MergetrainAction,
  type MergetrainCommandResult
} from '../../shared/mergetrain-contract'
import type { ProcessResult } from '@orca/process-host/process-spec'

const Envelope = z.object({ contract_version: z.number(), ok: z.boolean() })
const Failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const Enqueued = z.object({ job: MergetrainJobSchema })
const Validated = z.object({ result: z.string(), jobs: z.array(MergetrainJobSchema) })

export function mergetrainError(code: string, message: string): MergetrainCommandResult {
  return { kind: 'error', code, message }
}

export function parseMergetrainOutput(
  action: MergetrainAction | 'status',
  process: ProcessResult
): MergetrainCommandResult {
  if (process.timedOut || process.signal) {
    return mergetrainError(
      'execution_unverifiable',
      'mergetrain stopped responding. Refresh the queue before starting another operation.'
    )
  }
  if (process.outputTruncated) {
    return mergetrainError(
      'output_limit',
      'mergetrain output exceeded the size limit. Refresh the queue to check its state.'
    )
  }
  try {
    const payload: unknown = JSON.parse(process.stdout)
    const envelope = Envelope.parse(payload)
    if (envelope.contract_version !== MERGETRAIN_CONTRACT_VERSION) {
      return mergetrainError(
        'unsupported_contract',
        `This Orca build supports mergetrain contract ${MERGETRAIN_CONTRACT_VERSION}; the CLI returned ${envelope.contract_version}. Update the integration before continuing.`
      )
    }
    if (!envelope.ok) {
      const { error } = Failure.parse(payload)
      return mergetrainError(error.code, error.message)
    }
    switch (action) {
      case 'status':
        if (process.code !== 0) {
          break
        }
        return { kind: 'status', status: MergetrainStatusSchema.parse(payload) }
      case 'enqueue':
        if (process.code !== 0) {
          break
        }
        return { kind: 'enqueue', job: Enqueued.parse(payload).job }
      case 'validate': {
        // Partial validation exits 1 but still carries the successful and failed jobs.
        const validated = Validated.parse(payload)
        if (![0, 1].includes(process.code ?? -1)) {
          break
        }
        return { kind: 'validate', outcome: validated.result, jobs: validated.jobs }
      }
    }
  } catch {
    // Raw output can contain credentials from a broken wrapper; only expose parsed CLI messages.
  }
  return mergetrainError(
    'output_unreadable',
    'Could not read mergetrain JSON. Check mergetrain status --json in a terminal on this host, then refresh.'
  )
}
