import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()
const mockGetUserById = vi.fn()
const mockCreateServiceClient = vi.fn()
const mockRender = vi.fn()
const mockCaptureException = vi.fn()
const mockJobEvaluationsSelect = vi.fn()
const mockJobEvaluationsIs = vi.fn()
const mockProfilesSelect = vi.fn()
const mockProfilesIn = vi.fn()
const mockEvaluationUpdate = vi.fn()
const mockEvaluationUpdateIn = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function taskFactory(config) {
    return config
  }),
  schedules: {
    task: vi.fn(function schedulesTaskFactory(config) {
      return config
    }),
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mockCreateServiceClient,
}))

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSend,
      },
    }
  }),
}))

vi.mock('@react-email/components', () => ({
  render: mockRender,
}))

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
}))

const { buildUserDigests, notifyUsersTask } = await import('@/trigger/notify-users')

describe('notifyUsersTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    process.env.RESEND_API_KEY = 'test-resend-api-key'
    process.env.RESEND_FROM_EMAIL = 'jobs@jobfish.ing'

    mockSend.mockResolvedValue({ error: null })
    mockRender.mockResolvedValue('<html />')
    mockEvaluationUpdateIn.mockResolvedValue({ error: null })

    mockJobEvaluationsSelect.mockReturnValue({ is: mockJobEvaluationsIs })
    mockJobEvaluationsIs.mockResolvedValue({ data: [], error: null })

    mockProfilesSelect.mockReturnValue({ in: mockProfilesIn })
    mockProfilesIn.mockResolvedValue({ data: [], error: null })

    mockEvaluationUpdate.mockReturnValue({ in: mockEvaluationUpdateIn })
  })

  it('is configured with a single retry — safe because notified_at guards against double-sends', () => {
    expect((notifyUsersTask as any).retry).toEqual({ maxAttempts: 2 })
  })

  it('includes all evaluations for the same title+company without deduplication', () => {
    const digests = buildUserDigests(
      [
        {
          id: 'evaluation-1',
          score: 8.5,
          reasoning: 'From LinkedIn',
          user_id: 'user-1',
          created_at: '2026-04-14T01:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-1',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://linkedin.com/jobs/123',
          },
        },
        {
          id: 'evaluation-2',
          score: 8.2,
          reasoning: 'From career site',
          user_id: 'user-1',
          created_at: '2026-04-14T02:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-2',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://acme.com/careers/head-of-product',
          },
        },
      ],
      [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
    )

    expect(digests).toEqual([
      {
        userId: 'user-1',
        evaluationIds: ['evaluation-1', 'evaluation-2'],
        jobs: [
          {
            jobId: 'job-evaluation-1',
            jobTitle: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            score: 8.5,
            reasoning: 'From LinkedIn',
            applyUrl: 'https://linkedin.com/jobs/123',
            dimensions: null,
          },
          {
            jobId: 'job-evaluation-2',
            jobTitle: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            score: 8.2,
            reasoning: 'From career site',
            applyUrl: 'https://acme.com/careers/head-of-product',
            dimensions: null,
          },
        ],
      },
    ])
  })

  it('builds digests from array-shaped job relations and skips null jobs', () => {
    const digests = buildUserDigests(
      [
        {
          id: 'evaluation-2',
          score: 8.1,
          reasoning: 'Use the first related job',
          user_id: 'user-1',
          dimensions: null,
          jobs: [
            {
              id: 'job-evaluation-2-first',
              title: 'First Role',
              company: 'Acme',
              location: 'Zurich',
              url: 'https://example.com/first-role',
            },
            {
              id: 'job-evaluation-2-second',
              title: 'Second Role',
              company: 'Acme',
              location: 'Remote',
              url: 'https://example.com/second-role',
            },
          ],
        },
        {
          id: 'evaluation-1',
          score: 8.3,
          reasoning: 'Missing job relation',
          user_id: 'user-1',
          dimensions: null,
          jobs: null,
        },
      ],
      [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
    )

    expect(digests).toEqual([
      {
        userId: 'user-1',
        evaluationIds: ['evaluation-2'],
        jobs: [
          {
            jobId: 'job-evaluation-2-first',
            jobTitle: 'First Role',
            company: 'Acme',
            location: 'Zurich',
            score: 8.1,
            reasoning: 'Use the first related job',
            applyUrl: 'https://example.com/first-role',
            dimensions: null,
          },
        ],
      },
    ])
  })

  it('groups qualifying evaluations into one digest per user and marks included rows as notified', async () => {
    mockJobEvaluationsIs.mockResolvedValueOnce({
      data: [
        {
          id: 'evaluation-4',
          score: 8.2,
          reasoning: 'Great leadership overlap',
          user_id: 'user-2',
          created_at: '2026-04-10T05:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-4',
            title: 'VP Product',
            company: 'Globex',
            location: null,
            url: 'https://example.com/vp-product',
          },
        },
        {
          id: 'evaluation-2',
          score: 7.6,
          reasoning: 'Solid fit',
          user_id: 'user-1',
          created_at: '2026-04-10T04:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-2',
            title: 'Director of Product',
            company: 'Acme',
            location: 'Remote',
            url: 'https://example.com/director-of-product',
          },
        },
        {
          id: 'evaluation-5',
          score: 9.1,
          reasoning: 'Notifications disabled',
          user_id: 'user-3',
          created_at: '2026-04-10T03:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-5',
            title: 'Chief Product Officer',
            company: 'Initech',
            location: 'Bern',
            url: 'https://example.com/cpo',
          },
        },
        {
          id: 'evaluation-1',
          score: 8.4,
          reasoning: 'Strong match',
          user_id: 'user-1',
          created_at: '2026-04-10T01:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-1',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/head-of-product',
          },
        },
        {
          id: 'evaluation-3',
          score: 6.8,
          reasoning: 'Below threshold',
          user_id: 'user-1',
          created_at: '2026-04-10T02:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-3',
            title: 'Product Manager',
            company: 'Acme',
            location: 'Basel',
            url: 'https://example.com/product-manager',
          },
        },
      ],
      error: null,
    })

    mockProfilesIn.mockResolvedValueOnce({
      data: [
        { id: 'user-1', threshold: 7, notifications_enabled: true },
        { id: 'user-2', threshold: 8, notifications_enabled: true },
        { id: 'user-3', threshold: 7, notifications_enabled: false },
      ],
      error: null,
    })

    mockGetUserById.mockImplementation(async (userId: string) => ({
      data: {
        user: {
          id: userId,
          email: `${userId}@example.com`,
        },
      },
    }))

    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'job_evaluations') {
          return {
            select: mockJobEvaluationsSelect,
            update: mockEvaluationUpdate,
          }
        }

        if (table === 'profiles') {
          return {
            select: mockProfilesSelect,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    })

    const result = await (notifyUsersTask as any).run()

    expect(result).toEqual({ notifiedCount: 2, evaluationCount: 3 })
    expect(mockJobEvaluationsSelect).toHaveBeenCalledWith(expect.stringContaining('created_at'))
    expect(mockJobEvaluationsIs).toHaveBeenCalledWith('notified_at', null)
    expect(mockProfilesIn).toHaveBeenCalledWith('id', ['user-1', 'user-2', 'user-3'])
    expect(mockGetUserById).toHaveBeenCalledTimes(2)
    expect(mockGetUserById.mock.calls).toEqual([['user-1'], ['user-2']])
    expect(mockRender).toHaveBeenCalledTimes(2)
    const renderedGroups = mockRender.mock.calls.map(([element]) => element.props.jobs)
    expect(renderedGroups).toEqual([
      [
        {
          jobId: 'job-evaluation-1',
          jobTitle: 'Head of Product',
          company: 'Acme',
          location: 'Zurich',
          score: 8.4,
          reasoning: 'Strong match',
          applyUrl: 'https://example.com/head-of-product',
          dimensions: null,
        },
        {
          jobId: 'job-evaluation-2',
          jobTitle: 'Director of Product',
          company: 'Acme',
          location: 'Remote',
          score: 7.6,
          reasoning: 'Solid fit',
          applyUrl: 'https://example.com/director-of-product',
          dimensions: null,
        },
      ],
      [
        {
          jobId: 'job-evaluation-4',
          jobTitle: 'VP Product',
          company: 'Globex',
          location: null,
          score: 8.2,
          reasoning: 'Great leadership overlap',
          applyUrl: 'https://example.com/vp-product',
          dimensions: null,
        },
      ],
    ])
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend.mock.calls.map(([payload]) => payload.to)).toEqual(['user-1@example.com', 'user-2@example.com'])
    expect(mockSend.mock.calls.map(([payload]) => payload.subject)).toEqual([
      '2 new job matches this morning',
      '1 new job match this morning',
    ])
    expect(mockEvaluationUpdate).toHaveBeenCalledTimes(2)
    expect(mockEvaluationUpdateIn.mock.calls).toEqual([
      ['id', ['evaluation-1', 'evaluation-2']],
      ['id', ['evaluation-4']],
    ])
    expect(mockEvaluationUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ notified_at: expect.any(String) })
    )
    expect(mockEvaluationUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ notified_at: expect.any(String) })
    )
  })

  it('does not mark evaluations notified when sending a digest fails', async () => {
    mockJobEvaluationsIs.mockResolvedValueOnce({
      data: [
        {
          id: 'evaluation-1',
          score: 8.4,
          reasoning: 'Strong match',
          user_id: 'user-1',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-1',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/head-of-product',
          },
        },
      ],
      error: null,
    })

    mockProfilesIn.mockResolvedValueOnce({
      data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
      error: null,
    })

    mockGetUserById.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-1',
          email: 'user-1@example.com',
        },
      },
    })

    mockSend.mockResolvedValueOnce({ error: new Error('send failed') })

    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'job_evaluations') {
          return {
            select: mockJobEvaluationsSelect,
            update: mockEvaluationUpdate,
          }
        }

        if (table === 'profiles') {
          return {
            select: mockProfilesSelect,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    })

    const result = await (notifyUsersTask as any).run()

    expect(result).toEqual({ notifiedCount: 0, evaluationCount: 0 })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
    expect(mockEvaluationUpdateIn).not.toHaveBeenCalled()
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })

  it('throws when sending succeeds but marking evaluations as notified fails', async () => {
    mockJobEvaluationsIs.mockResolvedValueOnce({
      data: [
        {
          id: 'evaluation-1',
          score: 8.4,
          reasoning: 'Strong match',
          user_id: 'user-1',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-1',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/head-of-product',
          },
        },
      ],
      error: null,
    })

    mockProfilesIn.mockResolvedValueOnce({
      data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
      error: null,
    })

    mockGetUserById.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-1',
          email: 'user-1@example.com',
        },
      },
    })

    const updateError = new Error('update failed')
    mockEvaluationUpdateIn.mockResolvedValueOnce({ error: updateError })

    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'job_evaluations') {
          return {
            select: mockJobEvaluationsSelect,
            update: mockEvaluationUpdate,
          }
        }

        if (table === 'profiles') {
          return {
            select: mockProfilesSelect,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    })

    await expect((notifyUsersTask as any).run()).rejects.toThrow('update failed')

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockEvaluationUpdate).toHaveBeenCalledTimes(1)
    expect(mockEvaluationUpdateIn).toHaveBeenCalledWith('id', ['evaluation-1'])
    expect(mockCaptureException).toHaveBeenCalledWith(
      updateError,
      expect.objectContaining({
        extra: { userId: 'user-1', evaluationIds: ['evaluation-1'] },
      })
    )
  })

  it('skips users with no deliverable email and continues the batch', async () => {
    mockJobEvaluationsIs.mockResolvedValueOnce({
      data: [
        {
          id: 'evaluation-1',
          score: 8.4,
          reasoning: 'Strong match',
          user_id: 'user-1',
          created_at: '2026-04-10T01:00:00.000Z',
          dimensions: null,
          jobs: {
            id: 'job-evaluation-1',
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/head-of-product',
          },
        },
      ],
      error: null,
    })

    mockProfilesIn.mockResolvedValueOnce({
      data: [{ id: 'user-1', threshold: 7, notifications_enabled: true }],
      error: null,
    })

    mockGetUserById.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: null } },
    })

    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'job_evaluations') return { select: mockJobEvaluationsSelect, update: mockEvaluationUpdate }
        if (table === 'profiles') return { select: mockProfilesSelect }
        throw new Error(`Unexpected table: ${table}`)
      },
      auth: { admin: { getUserById: mockGetUserById } },
    })

    const result = await (notifyUsersTask as any).run()

    expect(result).toEqual({ notifiedCount: 0, evaluationCount: 0 })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Missing email for digest recipient' }),
      expect.objectContaining({ extra: { userId: 'user-1' } })
    )
  })

  it('returns zero counts when there are no unnotified evaluations', async () => {
    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'job_evaluations') {
          return {
            select: mockJobEvaluationsSelect,
            update: mockEvaluationUpdate,
          }
        }

        if (table === 'profiles') {
          return {
            select: mockProfilesSelect,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    })

    const result = await (notifyUsersTask as any).run()

    expect(result).toEqual({ notifiedCount: 0, evaluationCount: 0 })
    expect(mockProfilesSelect).not.toHaveBeenCalled()
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
  })

  it('sorts jobs by score descending within each user digest', () => {
    const digests = buildUserDigests(
      [
        {
          id: 'evaluation-1',
          score: 7.5,
          reasoning: 'Decent match',
          user_id: 'user-1',
          dimensions: null,
          jobs: { id: 'job-a', title: 'Job A', company: 'Acme', location: null, url: 'https://example.com/a' },
        },
        {
          id: 'evaluation-2',
          score: 9.0,
          reasoning: 'Excellent match',
          user_id: 'user-1',
          dimensions: null,
          jobs: { id: 'job-b', title: 'Job B', company: 'Acme', location: null, url: 'https://example.com/b' },
        },
        {
          id: 'evaluation-3',
          score: 8.2,
          reasoning: 'Strong match',
          user_id: 'user-1',
          dimensions: null,
          jobs: { id: 'job-c', title: 'Job C', company: 'Acme', location: null, url: 'https://example.com/c' },
        },
      ],
      [{ id: 'user-1', threshold: 7, notifications_enabled: true }]
    )

    expect(digests[0].jobs.map(j => ({ score: j.score, jobId: j.jobId }))).toEqual([
      { score: 9.0, jobId: 'job-b' },
      { score: 8.2, jobId: 'job-c' },
      { score: 7.5, jobId: 'job-a' },
    ])
  })
})
