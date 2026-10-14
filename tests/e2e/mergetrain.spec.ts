import path from 'node:path'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { runProcess } from '@orca/process-host'
import { test as base, expect } from './helpers/orca-app'
import { cleanupTestRepository } from './global-teardown'
import { createMergetrainRepository } from './helpers/mergetrain-repository'

const test = base.extend({
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const fixture = await createMergetrainRepository()
    registerPostElectronShutdownCleanup(async () => {
      cleanupTestRepository(fixture.repo)
      await rm(fixture.root, { recursive: true, force: true })
    })
    await writeFile(
      path.join(fixture.root, 'pins.json'),
      JSON.stringify({ base: fixture.base, heads: fixture.heads })
    )
    await provideFixture(fixture.repo)
  }
})

test.skip(
  process.env.ORCA_REAL_MERGETRAIN_TEST !== '1',
  'Requires mergetrain 3.5+ installed on this host'
)

test('registers linked worktrees and validates the actual local queue without pushing', async ({
  orcaPage,
  seededRepoPath
}, testInfo) => {
  const worktrees = await orcaPage.evaluate(() =>
    Object.values(window.__store?.getState().worktreesByRepo ?? {}).flat()
  )
  const good = worktrees.find((worktree) => worktree.branch === 'refs/heads/task/good')
  const broken = worktrees.find((worktree) => worktree.branch === 'refs/heads/task/broken')
  expect(good).toBeTruthy()
  expect(broken).toBeTruthy()
  if (!good || !broken) {
    throw new Error('Missing task worktrees')
  }
  const open = async (id: string, registering = true) => {
    await orcaPage.evaluate((worktreeId) => {
      const state = window.__store?.getState()
      state?.setActiveWorktree(worktreeId)
      state?.setRightSidebarOpen(true)
      state?.setRightSidebarTab('source-control')
    }, id)
    await orcaPage.getByRole('button', { name: 'Mergetrain', exact: true }).click()
    if (registering) {
      await expect(
        orcaPage.getByRole('button', { name: 'Register branch', exact: true })
      ).toBeEnabled()
    }
  }
  for (const worktree of [good, broken]) {
    await open(worktree.id)
    await orcaPage.getByRole('button', { name: 'Register branch', exact: true }).click()
    await orcaPage
      .getByLabel('Task description', { exact: true })
      .fill(`Validate ${worktree.branch} with $HOME; quoted text`)
    await orcaPage.getByRole('button', { name: 'Add to queue', exact: true }).click()
    await expect(orcaPage.getByText(/Registered job #/)).toBeVisible()
  }
  await expect(orcaPage.getByText('#1 task/good', { exact: true })).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Validate queue', exact: true }).click()
  await expect(orcaPage.getByText('Validating the queue on its execution host…')).toBeVisible()
  await open(good.id, false)
  await expect(orcaPage.getByText('Validating the queue on its execution host…')).toBeVisible()
  await expect(orcaPage.getByText('Validation result: partial', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText('#1 task/good: validated', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('#2 task/broken: failed', { exact: true })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('mergetrain-partial.png') })
  await orcaPage.evaluate(async () => window.__store?.getState().updateSettings({ theme: 'dark' }))
  await expect(orcaPage.locator('html')).toHaveClass(/dark/)
  await orcaPage.screenshot({ path: testInfo.outputPath('mergetrain-partial-dark.png') })
  const remote = path.join(path.dirname(seededRepoPath), 'remote.git')
  const remoteHead = await runProcess({
    program: 'git',
    args: ['--git-dir', remote, 'rev-parse', 'main']
  })
  const baseHead = await runProcess({
    program: 'git',
    args: ['rev-parse', 'main'],
    cwd: seededRepoPath
  })
  const pins = z
    .object({ base: z.string(), heads: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile(path.join(path.dirname(seededRepoPath), 'pins.json'), 'utf8')))
  expect(remoteHead.stdout.trim()).toBe(pins.base)
  expect(baseHead.stdout.trim()).toBe(pins.base)
  for (const [id, branch] of [
    [1, 'task/good'],
    [2, 'task/broken']
  ] as const) {
    const inspected = await runProcess({
      program: 'mergetrain',
      args: ['--repo', seededRepoPath, 'inspect', String(id), '--json']
    })
    const job = z
      .object({
        job: z.object({
          head_sha: z.string(),
          base_sha: z.string(),
          auto_deploy: z.boolean(),
          push_status: z.string()
        })
      })
      .parse(JSON.parse(inspected.stdout)).job
    expect(job.head_sha).toBe(pins.heads[branch])
    expect(job.base_sha).toBe(pins.base)
    expect(job.auto_deploy).toBe(false)
    expect(job.push_status).toBe('not_run')
  }
  const queue = await runProcess({
    program: 'mergetrain',
    args: ['--repo', seededRepoPath, 'status', '--json']
  })
  await writeFile(testInfo.outputPath('actual-queue.json'), queue.stdout)
  await writeFile(
    testInfo.outputPath('proof.json'),
    JSON.stringify(
      {
        pinnedCommits: pins,
        remoteHead: remoteHead.stdout.trim(),
        localMain: baseHead.stdout.trim(),
        workflow:
          'UI enqueue of two linked worktrees; switch during validation; one ready and one attention',
        manualQueue: true,
        pushStatus: 'not_run'
      },
      null,
      2
    )
  )
  await testInfo.attach('actual-queue', { body: queue.stdout, contentType: 'application/json' })
  expect(queue.stdout).toContain('"ready": 1')
  expect(queue.stdout).toContain('"attention": 1')
})
