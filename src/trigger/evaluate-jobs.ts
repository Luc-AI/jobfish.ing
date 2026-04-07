import { task } from '@trigger.dev/sdk/v3'

interface EvaluateJobsPayload {
  jobIds: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  run: async (_payload: EvaluateJobsPayload) => {
    // Stub — full implementation in Task 5
  },
})
