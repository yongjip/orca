// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MergetrainSnapshot } from '../../../../../shared/mergetrain-contract'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { useMergetrainQueue } from './use-mergetrain-queue'

const { call, capability } = vi.hoisted(() => ({ call: vi.fn(), capability: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: call,
  assertRuntimeEnvironmentCapability: capability
}))
const local: RuntimeClientTarget = { kind: 'local' }
const remote: RuntimeClientTarget = { kind: 'environment', environmentId: 'host-one' }
function snapshot(message: string): MergetrainSnapshot {
  return { result: { kind: 'error', code: 'cli_missing', message }, operation: null }
}

beforeEach(() => {
  call.mockReset()
  capability.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('mergetrain queue host ownership in the renderer', () => {
  it('does not spawn status reads until the queue is opened', async () => {
    call.mockResolvedValue(snapshot('Install on this host'))
    const hook = renderHook(({ open }) => useMergetrainQueue(local, 'first', open), {
      initialProps: { open: false }
    })
    expect(call).not.toHaveBeenCalled()
    hook.rerender({ open: true })
    await waitFor(() =>
      expect(hook.result.current.snapshot?.result).toMatchObject({ code: 'cli_missing' })
    )
    expect(call).toHaveBeenCalledWith(local, 'mergetrain.status', { worktree: 'id:first' })
  })

  it('keeps a delayed reply from a previous workspace out of the new panel', async () => {
    let finish!: (value: MergetrainSnapshot) => void
    call.mockReturnValueOnce(
      new Promise<MergetrainSnapshot>((resolve) => {
        finish = resolve
      })
    )
    const first = renderHook(() => useMergetrainQueue(local, 'first', true))
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
    first.unmount()
    call.mockResolvedValue(snapshot('Second host'))
    const second = renderHook(() => useMergetrainQueue(remote, 'second', true))
    await waitFor(() =>
      expect(second.result.current.snapshot?.result).toMatchObject({ message: 'Second host' })
    )
    await act(async () => finish(snapshot('Old reply')))
    expect(second.result.current.snapshot?.result).toMatchObject({ message: 'Second host' })
    expect(call).toHaveBeenLastCalledWith(remote, 'mergetrain.status', { worktree: 'id:second' })
  })

  it('routes through the owning environment under remote latency', async () => {
    vi.useFakeTimers()
    capability.mockImplementation(() => new Promise<void>((resolve) => setTimeout(resolve, 150)))
    call.mockResolvedValue(snapshot('Observed remotely'))
    const hook = renderHook(() => useMergetrainQueue(remote, 'second', true))
    await act(async () => vi.advanceTimersByTime(149))
    expect(call).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(call).toHaveBeenCalledWith(remote, 'mergetrain.status', { worktree: 'id:second' })
    expect(hook.result.current.snapshot?.result).toMatchObject({ message: 'Observed remotely' })
  })

  it('refuses old remote hosts before sending a status or mutation request', async () => {
    capability.mockRejectedValue(new Error('Update the execution host'))
    const hook = renderHook(() => useMergetrainQueue(remote, 'second', true))
    await waitFor(() => expect(hook.result.current.error).toBe('Update the execution host'))
    await act(async () => hook.result.current.start({ action: 'validate', requestId: 'test' }))
    expect(call).not.toHaveBeenCalled()
  })
})
