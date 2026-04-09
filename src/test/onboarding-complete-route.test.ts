import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Mock Trigger.dev tasks
const mockTriggerAndWait = vi.fn()
vi.mock('@trigger.dev/sdk', () => ({
  tasks: {
    triggerAndWait: mockTriggerAndWait,
  },
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
  })

  it('returns 200 when scrape task succeeds', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockResolvedValueOnce({ ok: true })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockTriggerAndWait).toHaveBeenCalledWith(
      'scrape-jobs-initial',
      { userId: 'user-123' }
    )
  })

  it('returns 500 when scrape task result is not ok', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockResolvedValueOnce({ ok: false, error: 'task failed' })
    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('returns 500 when triggerAndWait throws', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } } })
    mockTriggerAndWait.mockRejectedValueOnce(new Error('network error'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
