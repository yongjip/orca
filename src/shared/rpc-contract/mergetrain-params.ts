import { z } from 'zod'
import { WorktreeSelector } from './git-params'

const EnqueueFields = {
  requestId: z.string().uuid(),
  task: z.string().trim().min(1).max(1000),
  expectedBranch: z
    .string()
    .min(1)
    .max(1000)
    .refine((value) => !value.startsWith('-'))
}

export const MergetrainStatusParams = WorktreeSelector
export const MergetrainEnqueueParams = WorktreeSelector.extend(EnqueueFields)
export const MergetrainValidateParams = WorktreeSelector.extend({ requestId: z.string().uuid() })
