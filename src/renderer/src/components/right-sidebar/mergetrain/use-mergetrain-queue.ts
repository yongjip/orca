import { useCallback, useEffect, useRef, useState } from 'react'
import { assertRuntimeEnvironmentCapability, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  MERGETRAIN_RUNTIME_CAPABILITY,
  type MergetrainAction,
  type MergetrainOperation,
  type MergetrainRequest,
  type MergetrainSnapshot
} from '../../../../../shared/mergetrain-contract'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'

export function useMergetrainQueue(
  target: RuntimeClientTarget | null,
  worktreeId: string,
  open: boolean
) {
  const [snapshot, setSnapshot] = useState<MergetrainSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startingAction, setStartingAction] = useState<MergetrainAction | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const startingRef = useRef(false)

  const ensureHost = useCallback(async () => {
    if (!target) {
      throw new Error('The workspace execution host is unavailable.')
    }
    if (target.kind === 'environment') {
      await assertRuntimeEnvironmentCapability(
        target.environmentId,
        MERGETRAIN_RUNTIME_CAPABILITY,
        'Update Orca on this execution host to use its mergetrain queue.'
      )
    }
    return target
  }, [target])

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setRefreshing(true)
    try {
      const host = await ensureHost()
      const next = await callRuntimeRpc<MergetrainSnapshot>(host, 'mergetrain.status', {
        worktree: `id:${worktreeId}`
      })
      if (mounted.current) {
        setSnapshot(next)
        setError(null)
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not read the queue on its execution host.'
        )
      }
    } finally {
      inFlight.current = false
      if (mounted.current) {
        setRefreshing(false)
      }
    }
  }, [ensureHost, worktreeId])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => clearInterval(timer)
  }, [open, refresh])

  const start = useCallback(
    async (request: MergetrainRequest) => {
      if (startingRef.current) {
        return
      }
      startingRef.current = true
      setStartingAction(request.action)
      setError(null)
      try {
        const host = await ensureHost()
        const params =
          request.action === 'enqueue'
            ? {
                worktree: `id:${worktreeId}`,
                requestId: request.requestId,
                task: request.task,
                expectedBranch: request.expectedBranch
              }
            : { worktree: `id:${worktreeId}`, requestId: request.requestId }
        const operation = await callRuntimeRpc<MergetrainOperation>(
          host,
          `mergetrain.${request.action}`,
          params
        )
        if (mounted.current) {
          setSnapshot((current) => (current ? { ...current, operation } : current))
          void refresh()
        }
      } catch (failure) {
        if (mounted.current) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'The request could not be observed. Refresh the queue before retrying.'
          )
        }
      } finally {
        startingRef.current = false
        if (mounted.current) {
          setStartingAction(null)
        }
      }
    },
    [ensureHost, refresh, worktreeId]
  )

  return {
    snapshot,
    error,
    starting: startingAction !== null,
    startingAction,
    refreshing,
    refresh,
    start
  }
}
