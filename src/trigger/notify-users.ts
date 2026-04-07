import { task } from '@trigger.dev/sdk/v3'

interface NotifyUsersPayload {
  evaluationIds: string[]
}

export const notifyUsersTask = task({
  id: 'notify-users',
  run: async (_payload: NotifyUsersPayload) => {
    // Stub — full implementation in Task 7
  },
})
