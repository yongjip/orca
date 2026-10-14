import path from 'node:path'
import {
  canMutateMergetrain,
  type MergetrainOperation,
  type MergetrainRequest,
  type MergetrainSnapshot
} from '../../shared/mergetrain-contract'
import {
  localGitOptionsForTarget,
  requireRuntimeGitProvider,
  type RuntimeGitCommandHost,
  type RuntimeGitTarget
} from '../runtime/runtime-git-command-target'
import { parseWslPath, toLinuxPath } from '../wsl'
import { runMergetrainCli } from './mergetrain-cli'
import { mergetrainError } from './mergetrain-output'

type OperationRecord = { key: string; fingerprint: string; operation: MergetrainOperation }

export class RuntimeMergetrainCommands {
  private readonly operations = new Map<string, OperationRecord>()

  constructor(
    private readonly host: Pick<RuntimeGitCommandHost, 'resolveRuntimeGitTarget'>,
    private readonly execute: typeof runMergetrainCli = runMergetrainCli
  ) {}

  private async resolve(worktreeSelector: string) {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    if (target.repo?.kind === 'folder' || !target.repo) {
      throw new Error('mergetrain_requires_git_repository')
    }
    const provider = requireRuntimeGitProvider(target)
    const commonDir = (
      await provider.exec(['rev-parse', '--git-common-dir'], target.worktree.path)
    ).stdout.trim()
    const options = localGitOptionsForTarget(target)
    const distro = options.wslDistro ?? parseWslPath(target.worktree.path)?.distro
    const commonPath = distro
      ? path.posix.resolve(toLinuxPath(target.worktree.path), commonDir)
      : path.resolve(target.worktree.path, commonDir)
    const key = JSON.stringify([target.executionHostId, distro ?? null, commonPath])
    return { target, provider, key }
  }

  private invoke(
    target: RuntimeGitTarget,
    action: 'status' | 'enqueue' | 'validate',
    args?: string[]
  ) {
    return this.execute({
      repoPath: target.worktree.path,
      action,
      args,
      gitOptions: localGitOptionsForTarget(target)
    })
  }

  async status(worktreeSelector: string): Promise<MergetrainSnapshot> {
    const { target, key } = await this.resolve(worktreeSelector)
    const result = await this.invoke(target, 'status')
    const records = [...this.operations.values()].filter((record) => record.key === key)
    return { result, operation: records.at(-1)?.operation ?? null }
  }

  async start(worktreeSelector: string, request: MergetrainRequest): Promise<MergetrainOperation> {
    const scope = await this.resolve(worktreeSelector)
    const fingerprint = JSON.stringify([scope.key, scope.target.worktree.path, request])
    const existing = this.operations.get(request.requestId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('mergetrain_request_id_reused')
      }
      return existing.operation
    }
    const running = [...this.operations.values()].find(
      (record) => record.key === scope.key && record.operation.state === 'running'
    )
    if (running) {
      throw new Error('mergetrain_operation_in_progress')
    }
    // Keep recent receipts across panel switches without retaining unbounded process history.
    if (this.operations.size >= 128) {
      const oldest = [...this.operations.entries()].find(
        ([, record]) => record.operation.state === 'finished'
      )
      if (!oldest) {
        throw new Error('mergetrain_operation_limit')
      }
      this.operations.delete(oldest[0])
    }
    const operation: MergetrainOperation = {
      requestId: request.requestId,
      action: request.action,
      state: 'running',
      result: null
    }
    this.operations.set(request.requestId, { key: scope.key, fingerprint, operation })
    void this.perform(scope, request, operation)
    return operation
  }

  private async perform(
    scope: Awaited<ReturnType<RuntimeMergetrainCommands['resolve']>>,
    request: MergetrainRequest,
    operation: MergetrainOperation
  ): Promise<void> {
    try {
      const current = await this.invoke(scope.target, 'status')
      if (current.kind !== 'status') {
        operation.result = current
      } else if (!canMutateMergetrain(current.status)) {
        operation.result = mergetrainError('queue_unavailable', current.status.summary)
      } else if (request.action === 'validate') {
        operation.result =
          current.status.counts.waiting > 0 && current.status.counts.ready === 0
            ? await this.invoke(scope.target, 'validate')
            : mergetrainError(
                'nothing_to_validate',
                'Enqueue work first, or resolve the train that is already ready.'
              )
      } else {
        const branch = (
          await scope.provider.exec(
            ['symbolic-ref', '--quiet', '--short', 'HEAD'],
            scope.target.worktree.path
          )
        ).stdout.trim()
        operation.result =
          branch === request.expectedBranch
            ? await this.invoke(scope.target, 'enqueue', [
                '--task',
                request.task,
                '--branch',
                branch
              ])
            : mergetrainError(
                'branch_changed',
                'The workspace branch changed. Refresh before registering it.'
              )
      }
    } catch {
      operation.result = mergetrainError(
        'execution_unverifiable',
        'The operation could not be observed. Refresh the queue on its execution host before retrying.'
      )
    } finally {
      operation.state = 'finished'
    }
  }
}
