import { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { canMutateMergetrain } from '../../../../../shared/mergetrain-contract'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import {
  MergetrainOperationResult,
  MergetrainQueueStatus,
  MergetrainWorkingNotice
} from './mergetrain-queue-status'
import { useMergetrainQueue } from './use-mergetrain-queue'

export function MergetrainPanel({
  target,
  worktreeId,
  branch
}: {
  target: RuntimeClientTarget | null
  worktreeId: string
  branch: string
}) {
  const [open, setOpen] = useState(false)
  const [registration, setRegistration] = useState<{ afterRequestId: string | null } | null>(null)
  const [task, setTask] = useState('')
  const taskId = useId()
  const queue = useMergetrainQueue(target, worktreeId, open)
  const status = queue.snapshot?.result.kind === 'status' ? queue.snapshot.result.status : null
  const cliError = queue.snapshot?.result.kind === 'error' ? queue.snapshot.result.message : null
  const operation = queue.snapshot?.operation ?? null
  const registering =
    registration !== null &&
    !(
      operation?.result?.kind === 'enqueue' &&
      operation.result.job.branch === branch &&
      operation.requestId !== registration.afterRequestId
    )
  const busy = queue.starting || operation?.state === 'running'
  const action = queue.startingAction ?? operation?.action
  const enabled = status !== null && canMutateMergetrain(status) && !queue.error && !busy
  const alreadyQueued =
    status &&
    [...status.recent_jobs, ...status.attention_jobs].some(
      (job) => job.branch === branch && ['waiting', 'running', 'ready'].includes(job.state)
    )

  return (
    <section className="border-t border-border px-3 py-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Mergetrain
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {translate(
                'mergetrain.description',
                'Register this branch and validate the repository queue together. Deployment remains a separate approval step.'
              )}
            </p>
            {(queue.error || cliError) && (
              <p role="alert" className="break-words text-xs text-destructive">
                {queue.error ?? cliError}
              </p>
            )}
            {status && !queue.error && <MergetrainQueueStatus status={status} />}
            {!queue.snapshot && queue.refreshing && (
              <MergetrainWorkingNotice
                message={translate(
                  'mergetrain.loadingQueue',
                  'Reading the queue on its execution host…'
                )}
              />
            )}
            {busy && (
              <MergetrainWorkingNotice
                message={
                  action === 'validate'
                    ? translate(
                        'mergetrain.validating',
                        'Validating the queue on its execution host…'
                      )
                    : translate('mergetrain.registering', 'Registering this branch…')
                }
              />
            )}
            <MergetrainOperationResult operation={operation} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!enabled || !branch || Boolean(alreadyQueued)}
                onClick={() => {
                  setRegistration({ afterRequestId: operation?.requestId ?? null })
                  setTask('')
                }}
              >
                {translate('mergetrain.registerBranch', 'Register branch')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !enabled || !status || status.counts.waiting === 0 || status.counts.ready > 0
                }
                onClick={() =>
                  void queue.start({ action: 'validate', requestId: createBrowserUuid() })
                }
              >
                {translate('mergetrain.validateQueue', 'Validate queue')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={queue.refreshing}
                onClick={() => void queue.refresh()}
              >
                {translate('mergetrain.refresh', 'Refresh')}
              </Button>
            </div>
            {registering && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (enabled && task.trim()) {
                    void queue.start({
                      action: 'enqueue',
                      requestId: createBrowserUuid(),
                      task: task.trim(),
                      expectedBranch: branch
                    })
                  }
                }}
              >
                <p className="break-words text-xs text-muted-foreground">{branch}</p>
                <div className="space-y-1">
                  <Label htmlFor={taskId}>{translate('mergetrain.task', 'Task description')}</Label>
                  <Input
                    id={taskId}
                    value={task}
                    maxLength={1000}
                    disabled={busy}
                    onChange={(event) => setTask(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'mergetrain.cleanBranch',
                    'Commit all changes first. Mergetrain records the exact branch commit for this job.'
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    type="submit"
                    disabled={!enabled || !task.trim() || Boolean(alreadyQueued)}
                  >
                    {translate('mergetrain.addToQueue', 'Add to queue')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setRegistration(null)}
                  >
                    {translate('mergetrain.cancel', 'Cancel')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
