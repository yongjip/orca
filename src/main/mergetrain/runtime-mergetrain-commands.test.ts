import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeGitTarget } from '../runtime/runtime-git-command-target'
import {
  MergetrainStatusSchema,
  type MergetrainCommandResult
} from '../../shared/mergetrain-contract'
import { RuntimeMergetrainCommands } from './runtime-mergetrain-commands'

const { exec, createProvider } = vi.hoisted(() => ({ exec: vi.fn(), createProvider: vi.fn() }))
vi.mock('../providers/local-git-provider', () => ({ createLocalGitProvider: createProvider }))

function target(worktreePath = '/repo/task'): RuntimeGitTarget {
  const git = {
    path: worktreePath,
    head: 'a',
    branch: 'refs/heads/task/one',
    isBare: false,
    isMainWorktree: false
  }
  return {
    executionHostId: 'local',
    repo: { id: 'repo', path: '/repo', displayName: 'Repo', badgeColor: '', addedAt: 0 },
    worktree: {
      ...git,
      git,
      id: 'worktree',
      repoId: 'repo',
      displayName: 'Task',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    }
  }
}

function status(): MergetrainCommandResult {
  return {
    kind: 'status',
    status: MergetrainStatusSchema.parse({
      contract_version: 5,
      ok: true,
      health: 'healthy',
      state: 'waiting',
      summary: 'One queued branch',
      counts: { waiting: 1, running: 0, ready: 0, attention: 0, done: 0 },
      next_action: { code: 'validate_queued_jobs', requires_approval: 'runner' },
      warnings: [],
      attention_jobs: [],
      recent_jobs: []
    })
  }
}

beforeEach(() => {
  exec.mockReset().mockImplementation(async (args: string[]) => ({
    stdout: args[0] === 'symbolic-ref' ? 'task/one' : '/repo/.git',
    stderr: ''
  }))
  createProvider.mockReset().mockReturnValue({ exec })
})

describe('repository-owned mergetrain operations', () => {
  it('pins enqueue to the observed branch, preserves argv and never enables auto deploy', async () => {
    const execute = vi.fn().mockImplementation(async (input) =>
      input.action === 'status'
        ? status()
        : {
            kind: 'enqueue',
            job: { id: 1, branch: 'task/one', task: 'Quotes $HOME; "text"', status: 'queued' }
          }
    )
    const commands = new RuntimeMergetrainCommands(
      { resolveRuntimeGitTarget: async () => target('/repo with spaces/task') },
      execute
    )
    const request = {
      action: 'enqueue',
      requestId: 'request',
      task: 'Quotes $HOME; "text"',
      expectedBranch: 'task/one'
    } as const
    await commands.start('worktree', request)
    await vi.waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'enqueue',
          repoPath: '/repo with spaces/task',
          args: ['--task', request.task, '--branch', 'task/one']
        })
      )
    )
    expect((await commands.status('worktree')).operation?.result?.kind).toBe('enqueue')
  })

  it('shares linked-worktree operations and returns the same receipt on a repeated request', async () => {
    let finish!: (value: MergetrainCommandResult) => void
    const validating = new Promise<MergetrainCommandResult>((resolve) => {
      finish = resolve
    })
    const execute = vi
      .fn()
      .mockImplementation(async (input) => (input.action === 'validate' ? validating : status()))
    const commands = new RuntimeMergetrainCommands(
      { resolveRuntimeGitTarget: async (selector) => target(`/repo/${selector}`) },
      execute
    )
    const request = { action: 'validate', requestId: 'same-request' } as const
    const receipt = await commands.start('first', request)
    expect(await commands.start('first', request)).toBe(receipt)
    await expect(
      commands.start('second', { ...request, requestId: 'new-request' })
    ).rejects.toThrow('operation_in_progress')
    expect((await commands.status('second')).operation?.state).toBe('running')
    finish({ kind: 'validate', outcome: 'partial', jobs: [] })
    await vi.waitFor(() => expect(receipt.state).toBe('finished'))
    expect((await commands.status('second')).operation?.result).toMatchObject({
      outcome: 'partial'
    })
    expect(execute.mock.calls.filter(([input]) => input.action === 'validate')).toHaveLength(1)
    await expect(
      commands.start('first', {
        ...request,
        action: 'enqueue',
        task: 'Changed',
        expectedBranch: 'task/one'
      })
    ).rejects.toThrow('request_id_reused')
  })

  it('refuses a stale branch and an unsupported contract before mutation', async () => {
    const execute = vi.fn().mockResolvedValue(status())
    const commands = new RuntimeMergetrainCommands(
      { resolveRuntimeGitTarget: async () => target() },
      execute
    )
    const operation = await commands.start('worktree', {
      action: 'enqueue',
      requestId: 'old-branch',
      task: 'Task',
      expectedBranch: 'old'
    })
    await vi.waitFor(() => expect(operation.state).toBe('finished'))
    expect(operation.result).toMatchObject({ kind: 'error', code: 'branch_changed' })
    execute.mockResolvedValue({
      kind: 'error',
      code: 'unsupported_contract',
      message: 'Update required'
    })
    const next = await commands.start('worktree', { action: 'validate', requestId: 'unsupported' })
    await vi.waitFor(() => expect(next.state).toBe('finished'))
    expect(execute.mock.calls.every(([input]) => input.action === 'status')).toBe(true)
  })

  it('isolates a same-path queue on two WSL distros', async () => {
    const execute = vi
      .fn()
      .mockImplementation(async (input) =>
        input.action === 'validate' ? new Promise<MergetrainCommandResult>(() => {}) : status()
      )
    const commands = new RuntimeMergetrainCommands(
      {
        resolveRuntimeGitTarget: async (selector) => ({
          ...target(),
          localGitOptions: { wslDistro: selector }
        })
      },
      execute
    )
    const first = await commands.start('Ubuntu', { action: 'validate', requestId: 'ubuntu' })
    const second = await commands.start('Debian', { action: 'validate', requestId: 'debian' })
    expect(first.requestId).toBe('ubuntu')
    expect(second.requestId).toBe('debian')
    expect((await commands.status('Ubuntu')).operation?.requestId).toBe('ubuntu')
    expect((await commands.status('Debian')).operation?.requestId).toBe('debian')
  })

  it('refuses SSH, foreign runtime and folder execution without a local fallback', async () => {
    const execute = vi.fn().mockResolvedValue(status())
    for (const hostId of ['ssh:box', 'runtime:foreign'] as const) {
      const remote = { ...target(), executionHostId: hostId }
      const commands = new RuntimeMergetrainCommands(
        { resolveRuntimeGitTarget: async () => remote },
        execute
      )
      await expect(commands.status('remote')).rejects.toThrow()
    }
    const folder = target()
    if (folder.repo) {
      folder.repo.kind = 'folder'
    }
    await expect(
      new RuntimeMergetrainCommands(
        { resolveRuntimeGitTarget: async () => folder },
        execute
      ).status('folder')
    ).rejects.toThrow('requires_git')
    expect(execute).not.toHaveBeenCalled()
  })
})
