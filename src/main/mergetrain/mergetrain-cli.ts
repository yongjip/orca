import { runProcess } from '@orca/process-host'
import { resolveCliCommand } from '../codex-cli/command'
import { resolveCommand } from '../git/command-runner/wsl-command-resolution'
import { resolveSelectedLocalCommand } from '../ipc/command-path-resolver'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import type { MergetrainAction, MergetrainCommandResult } from '../../shared/mergetrain-contract'
import { mergetrainError, parseMergetrainOutput } from './mergetrain-output'

export async function runMergetrainCli(input: {
  repoPath: string
  action: MergetrainAction | 'status'
  args?: string[]
  gitOptions?: GitRuntimeOptions
}): Promise<MergetrainCommandResult> {
  const command = resolveCommand(
    'mergetrain',
    ['--repo', input.repoPath, input.action, ...(input.args ?? []), '--json'],
    input.repoPath,
    input.gitOptions?.wslDistro,
    { useWslLoginShell: true, captureLoginShellOutput: true, terminationBarrier: true }
  )
  try {
    const result = await runProcess({
      program: command.wsl
        ? resolveSelectedLocalCommand(command.binary)
        : resolveCliCommand(command.binary),
      args: command.args,
      cwd: command.cwd,
      env: process.env,
      timeoutMs: input.action === 'validate' ? 60 * 60 * 1000 : 30_000,
      maxOutputBytes: 1024 * 1024,
      killOnOutputLimit: true,
      detached: process.platform !== 'win32',
      terminationBarrier: command.termination ?? true
    })
    return parseMergetrainOutput(input.action, {
      ...result,
      stdout: command.captured?.readStdout(result.stdout) ?? result.stdout
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return mergetrainError(
        'cli_missing',
        'Install mergetrain 3.5 or newer on this execution host and make it available on PATH, then refresh.'
      )
    }
    return mergetrainError(
      'execution_unverifiable',
      'Could not observe mergetrain on this host. Refresh the queue before starting another operation.'
    )
  }
}
