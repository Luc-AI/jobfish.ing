// src/test/sync-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockFetchDelta = vi.fn()
const mockNormalizeJobichJob = vi.fn()
const mockEvaluateTrigger = vi.fn()
const mockCategorizeTrigger = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  schedules: {
    task: vi.fn(function factory(config) { return config }),
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/jobich', () => ({
  fetchDelta: mockFetchDelta,
  normalizeJobichJob: mockNormalizeJobichJob,
}))

vi.mock('@/trigger/evaluate-jobs', () => ({
  evaluateJobsTask: { triggerAndWait: mockEvaluateTrigger },
}))

vi.mock('@/trigger/categorize-jobs', () => ({
  categorizeJobsTask: { triggerAndWait: mockCategorizeTrigger },
}))

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
}))

const { syncJobsTask } = await import('@/trigger/sync-jobs')

const emptyDelta = { added: [], updated: [], removed: [], server_time: '2026-05-20T01:00:00Z' }

function makeMockSupabase({
  syncState = null,
  insertedJobIds = ['job-uuid-1'],
}: {
  syncState?: { last_synced_at: string } | null
  insertedJobIds?: string[]
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'sync_state') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: syncState }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'jobs') {
      return {
        update: () => ({ in: async () => ({ error: null }) }),
        upsert: () => ({
          select: async () => ({
            data: insertedJobIds.map(id => ({ id })),
            error: null,
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('syncJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNormalizeJobichJob.mockImplementation(job => ({ ...job, external_id: job.id }))
    mockEvaluateTrigger.mockResolvedValue({ ok: true })
    mockCategorizeTrigger.mockResolvedValue({ ok: true })
  })

  it('uses last_synced_at from sync_state when available', async () => {
    makeMockSupabase({ syncState: { last_synced_at: '2026-05-19T12:00:00Z' } })
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    expect(mockFetchDelta).toHaveBeenCalledWith('2026-05-19T12:00:00Z')
  })

  it('falls back to now()-24h when no sync_state row exists', async () => {
    makeMockSupabase({ syncState: null })
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    const calledWith = mockFetchDelta.mock.calls[0][0]
    const calledDate = new Date(calledWith)
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000)
    expect(calledDate.getTime()).toBeGreaterThan(twentyFiveHoursAgo.getTime())
    expect(calledDate.getTime()).toBeLessThan(twentyThreeHoursAgo.getTime())
  })

  it('does not trigger evaluate-jobs when no new jobs are added', async () => {
    makeMockSupabase()
    mockFetchDelta.mockResolvedValue(emptyDelta)

    await (syncJobsTask as any).run()

    expect(mockEvaluateTrigger).not.toHaveBeenCalled()
  })

  it('triggers evaluate-jobs with new job IDs when added jobs exist', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1', 'job-2'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [
        { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
          remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
          posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
      ],
    })

    await (syncJobsTask as any).run()

    expect(mockEvaluateTrigger).toHaveBeenCalledWith({ jobIds: ['job-1', 'job-2'] })
  })

  it('stores server_time as the new cursor', async () => {
    makeMockSupabase()
    const serverTime = '2026-05-20T02:00:00Z'
    mockFetchDelta.mockResolvedValue({ ...emptyDelta, server_time: serverTime })

    await (syncJobsTask as any).run()

    // Find the upsert call on sync_state
    const syncStateUpsertCall = mockFrom.mock.results
      .map(r => r.value)
      .find(v => typeof v?.upsert === 'function')
    expect(syncStateUpsertCall?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_synced_at: serverTime })
    )
  })

  it('returns counts of added and removed', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [{ id: 'ext-1', title: 'Engineer', company: 'Acme', location: null,
        remote_type: null, description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: null }],
      removed: [{ id: 'old-ext', url: 'https://example.com/old' }],
    })

    const result = await (syncJobsTask as any).run()

    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })

  it('triggers categorize-jobs before evaluate-jobs when new jobs exist', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [
        { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
          remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
          posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
      ],
    })

    const callOrder: string[] = []
    mockCategorizeTrigger.mockImplementation(async () => { callOrder.push('categorize'); return { ok: true } })
    mockEvaluateTrigger.mockImplementation(async () => { callOrder.push('evaluate'); return { ok: true } })

    await (syncJobsTask as any).run()

    expect(callOrder).toEqual(['categorize', 'evaluate'])
    expect(mockCategorizeTrigger).toHaveBeenCalledWith({ jobIds: ['job-1'] })
  })

  it('still triggers evaluate-jobs even if categorize-jobs fails', async () => {
    makeMockSupabase({ insertedJobIds: ['job-1'] })
    mockFetchDelta.mockResolvedValue({
      ...emptyDelta,
      added: [
        { id: 'ext-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
          remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
          posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' },
      ],
    })
    mockCategorizeTrigger.mockResolvedValue({ ok: false, error: 'LLM timeout' })

    await (syncJobsTask as any).run()

    expect(mockEvaluateTrigger).toHaveBeenCalledWith({ jobIds: ['job-1'] })
  })
})
