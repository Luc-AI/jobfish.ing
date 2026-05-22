// src/test/onboarding-complete-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

const mockTrigger = vi.fn()
const mockPoll = vi.fn()
vi.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: mockTrigger },
  runs: { poll: mockPoll },
}))

const { POST } = await import('@/app/api/onboarding/complete/route')

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockTrigger).not.toHaveBeenCalled()
  })

  it('returns 200 and only polls phase-1 when phase-1 finds jobs', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger
      .mockResolvedValueOnce({ id: 'run-1' })  // phase 1 trigger
      .mockResolvedValueOnce({ id: 'run-2' })  // phase 2 trigger
    mockPoll.mockResolvedValueOnce({ isSuccess: true, output: { evaluatedCount: 5 } })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockTrigger).toHaveBeenCalledTimes(2)
    expect(mockTrigger).toHaveBeenNthCalledWith(
      1,
      'evaluate-jobs',
      expect.objectContaining({ userIds: ['user-123'], phase: 'onboarding-1' }),
    )
    expect(mockTrigger).toHaveBeenNthCalledWith(
      2,
      'evaluate-jobs',
      expect.objectContaining({ userIds: ['user-123'], phase: 'onboarding-2' }),
    )
    // phase 2 trigger fires but its poll is never called
    expect(mockPoll).toHaveBeenCalledTimes(1)
    expect(mockPoll).toHaveBeenCalledWith({ id: 'run-1' }, { pollIntervalMs: 1000 })
  })

  it('returns 200 and polls phase-2 as fallback when phase-1 finds no jobs', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce({ id: 'run-2' })
    mockPoll
      .mockResolvedValueOnce({ isSuccess: true, output: { evaluatedCount: 0 } }) // phase 1 empty
      .mockResolvedValueOnce({ isSuccess: true, output: { evaluatedCount: 3 } }) // phase 2 fills in

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockTrigger).toHaveBeenCalledTimes(2)
    expect(mockPoll).toHaveBeenCalledTimes(2)
    expect(mockPoll).toHaveBeenNthCalledWith(1, { id: 'run-1' }, { pollIntervalMs: 1000 })
    expect(mockPoll).toHaveBeenNthCalledWith(2, { id: 'run-2' }, { pollIntervalMs: 1000 })
  })

  it('returns 500 when runs.poll throws', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTrigger
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce({ id: 'run-2' })
    mockPoll.mockRejectedValueOnce(new Error('trigger timeout'))

    const res = await POST()
    expect(res.status).toBe(500)
  })
})
