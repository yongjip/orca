import { createContext, useContext } from 'react'
import type { RpcClientContextValue } from './rpc-client-context-contract'

export const RpcClientReactContext = createContext<RpcClientContextValue | null>(null)

export function useRpcClientContext(): RpcClientContextValue {
  const ctx = useContext(RpcClientReactContext)
  if (!ctx) {
    throw new Error('useHostClient must be used inside <RpcClientProvider>')
  }
  return ctx
}
