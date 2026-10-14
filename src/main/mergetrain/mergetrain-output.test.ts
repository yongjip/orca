import { describe, expect, it } from 'vitest'
import type { ProcessResult } from '@orca/process-host/process-spec'
import { canMutateMergetrain, MergetrainStatusSchema } from '../../shared/mergetrain-contract'
import { parseMergetrainOutput } from './mergetrain-output'

function output(payload: unknown, code = 0): ProcessResult {
  return { stdout: JSON.stringify(payload), stderr: '', code, timedOut: false, signal: null }
}

describe('mergetrain machine output', () => {
  it('keeps partial validation with exit 1 and strips unneeded job fields', () => {
    const result = parseMergetrainOutput(
      'validate',
      output(
        {
          contract_version: 5,
          ok: true,
          result: 'partial',
          jobs: [
            { id: 1, branch: 'task/one', task: 'One', status: 'validated', head_sha: 'a' },
            { id: 2, branch: 'task/two', task: 'Two', status: 'failed' }
          ]
        },
        1
      )
    )
    expect(result).toEqual({
      kind: 'validate',
      outcome: 'partial',
      jobs: [
        { id: 1, branch: 'task/one', task: 'One', status: 'validated' },
        { id: 2, branch: 'task/two', task: 'Two', status: 'failed' }
      ]
    })
  })

  it('does not label an ok:true failed validation as a success', () => {
    expect(
      parseMergetrainOutput(
        'validate',
        output({ contract_version: 5, ok: true, result: 'failed', jobs: [] }, 1)
      )
    ).toMatchObject({ kind: 'validate', outcome: 'failed' })
  })

  it('reads a typed CLI error even when the process exits 2', () => {
    expect(
      parseMergetrainOutput(
        'enqueue',
        output(
          {
            contract_version: 5,
            ok: false,
            error: { code: 'duplicate_active_branch', message: 'Already queued', retryable: false }
          },
          2
        )
      )
    ).toEqual({ kind: 'error', code: 'duplicate_active_branch', message: 'Already queued' })
  })

  it('rejects unsupported contracts and truncated, interrupted or unstructured output', () => {
    expect(
      parseMergetrainOutput('status', output({ contract_version: 6, ok: true }))
    ).toMatchObject({ kind: 'error', code: 'unsupported_contract' })
    expect(parseMergetrainOutput('status', { ...output({}), outputTruncated: true })).toMatchObject(
      { kind: 'error', code: 'output_limit' }
    )
    expect(parseMergetrainOutput('status', { ...output({}), timedOut: true })).toMatchObject({
      kind: 'error',
      code: 'execution_unverifiable'
    })
    expect(
      parseMergetrainOutput('status', {
        ...output({}),
        stdout: 'secret=private',
        stderr: 'secret=private'
      })
    ).toMatchObject({ kind: 'error', code: 'output_unreadable' })
  })

  it('tolerates additive read fields while refusing unknown safety values', () => {
    const status = MergetrainStatusSchema.parse({
      contract_version: 5,
      ok: true,
      health: 'healthy',
      state: 'waiting',
      summary: 'Waiting',
      counts: { waiting: 1, running: 0, ready: 0, attention: 0, done: 0 },
      next_action: { code: 'validate_queued_jobs', requires_approval: 'runner' },
      warnings: [],
      attention_jobs: [],
      recent_jobs: [],
      additive_field: 'ignored'
    })
    expect(canMutateMergetrain(status)).toBe(true)
    for (const unknown of [
      { ...status, health: 'new-health' },
      { ...status, state: 'new-state' },
      { ...status, next_action: { ...status.next_action, code: 'new-action' } },
      { ...status, next_action: { ...status.next_action, requires_approval: 'new-approval' } }
    ]) {
      expect(canMutateMergetrain(unknown)).toBe(false)
    }
  })
})
