import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from '@orca/process-host'

export async function createMergetrainRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orca mergetrain '))
  const repo = path.join(root, 'repo')
  const remote = path.join(root, 'remote.git')
  await mkdir(repo)
  const git = async (cwd: string, args: string[]) => {
    const result = await runProcess({ program: 'git', args, cwd })
    if (result.code !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  await git(root, ['init', '--bare', remote])
  await git(repo, ['init'])
  await git(repo, ['checkout', '-b', 'main'])
  await git(repo, ['config', 'user.name', 'Yongjip Test'])
  await git(repo, ['config', 'user.email', 'mergetrain-test@example.invalid'])
  await writeFile(path.join(repo, '.gitignore'), '.mergetrain/\n')
  await writeFile(path.join(repo, 'gates.sh'), 'sleep 5\ntest ! -f broken.txt\n')
  await writeFile(
    path.join(repo, '.mergetrain.yaml'),
    [
      'version: 2',
      'git:',
      '  remote: origin',
      '  integration_branch: main',
      '  push_refs: [main]',
      'gates:',
      '  - name: local-test',
      '    run: sh gates.sh',
      ''
    ].join('\n')
  )
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-m', 'Configure local queue checks'])
  await git(repo, ['remote', 'add', 'origin', remote])
  await git(repo, ['push', '-u', 'origin', 'main'])
  const base = await git(repo, ['rev-parse', 'HEAD'])
  const heads: Record<string, string> = {}
  for (const branch of ['task/good', 'task/broken']) {
    const worktree = path.join(root, branch.replace('/', ' '))
    await git(repo, ['worktree', 'add', '-b', branch, worktree, 'main'])
    await writeFile(path.join(worktree, branch === 'task/good' ? 'good.txt' : 'broken.txt'), branch)
    await git(worktree, ['add', '.'])
    await git(worktree, ['commit', '-m', branch])
    heads[branch] = await git(worktree, ['rev-parse', 'HEAD'])
  }
  return { root, repo, remote, base, heads, git }
}
