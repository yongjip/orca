import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import type {
  MergetrainOperation,
  MergetrainStatus
} from '../../../../../shared/mergetrain-contract'

export function MergetrainQueueStatus({ status }: { status: MergetrainStatus }) {
  const jobs = [
    ...new Map(
      [...status.attention_jobs, ...status.recent_jobs].map((job) => [job.id, job])
    ).values()
  ].slice(0, 10)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{status.summary}</p>
      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt>{translate('mergetrain.waiting', 'Waiting')}</dt>
          <dd>{status.counts.waiting}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{translate('mergetrain.running', 'Running')}</dt>
          <dd>{status.counts.running}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{translate('mergetrain.ready', 'Ready')}</dt>
          <dd>{status.counts.ready}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{translate('mergetrain.attention', 'Attention')}</dt>
          <dd>{status.counts.attention}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{translate('mergetrain.done', 'Done')}</dt>
          <dd>{status.counts.done}</dd>
        </div>
      </dl>
      {status.warnings.map((warning) => (
        <p key={warning.code} className="text-xs text-muted-foreground">
          {warning.summary}
        </p>
      ))}
      {status.health === 'unconfigured' && (
        <p className="text-xs text-muted-foreground">
          {translate(
            'mergetrain.setup',
            'Run mergetrain init --write in this repository, configure its checks, and commit the configuration before registering work.'
          )}
        </p>
      )}
      {jobs.length > 0 && (
        <ul className="space-y-2" aria-label={translate('mergetrain.jobs', 'Recent queue jobs')}>
          {jobs.map((job) => (
            <li key={job.id} className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  #{job.id} {job.branch}
                </span>
                <Badge variant="outline">{job.outcome ?? job.state}</Badge>
              </div>
              <p className="break-words text-muted-foreground">{job.task}</p>
              {job.reason && <p className="break-words text-destructive">{job.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MergetrainOperationResult({
  operation
}: {
  operation: MergetrainOperation | null
}) {
  const result = operation?.result
  if (!result || operation?.state !== 'finished') {
    return null
  }
  return (
    <div className="space-y-1 text-xs" role="status">
      {result.kind === 'error' && <p className="text-destructive">{result.message}</p>}
      {result.kind === 'enqueue' && (
        <p>{translate('mergetrain.enqueued', 'Registered job #{{id}}', { id: result.job.id })}</p>
      )}
      {result.kind === 'validate' && (
        <>
          <p>
            {translate('mergetrain.validationResult', 'Validation result: {{outcome}}', {
              outcome: result.outcome
            })}
          </p>
          {result.jobs.map((job) => (
            <p key={job.id} className="break-words text-muted-foreground">
              #{job.id} {job.branch}: {job.status}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

export function MergetrainWorkingNotice({ message }: { message: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="flex min-h-5 items-center gap-2 text-xs" role="status">
      {visible && (
        <>
          <LoadingSpinner className="size-4" />
          {message}
        </>
      )}
    </div>
  )
}
