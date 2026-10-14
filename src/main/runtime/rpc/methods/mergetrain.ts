import { defineMethod } from '../core'
import {
  MergetrainEnqueueParams,
  MergetrainStatusParams,
  MergetrainValidateParams
} from '../../../../shared/rpc-contract/mergetrain-params'

export const MERGETRAIN_METHODS = [
  defineMethod({
    name: 'mergetrain.status',
    permission: 'workspace',
    params: MergetrainStatusParams,
    handler: (params, { runtime }) => runtime.getMergetrainStatus(params.worktree)
  }),
  defineMethod({
    name: 'mergetrain.enqueue',
    permission: 'workspace',
    params: MergetrainEnqueueParams,
    handler: (params, { runtime }) =>
      runtime.startMergetrainOperation(params.worktree, {
        requestId: params.requestId,
        action: 'enqueue',
        task: params.task,
        expectedBranch: params.expectedBranch
      })
  }),
  defineMethod({
    name: 'mergetrain.validate',
    permission: 'workspace',
    params: MergetrainValidateParams,
    handler: (params, { runtime }) =>
      runtime.startMergetrainOperation(params.worktree, {
        requestId: params.requestId,
        action: 'validate'
      })
  })
]
