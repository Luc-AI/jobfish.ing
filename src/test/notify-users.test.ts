import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()
const mockGetUserById = vi.fn()
const mockCreateServiceClient = vi.fn()
const mockRender = vi.fn()
const mockCaptureException = vi.fn()
const mockJobEvaluationsSelect = vi.fn()
const mockJobEvaluationsIn = vi.fn()
const mockJobEvaluationsIs = vi.fn()
const mockProfilesSelect = vi.fn()
const mockProfilesIn = vi.fn()
const mockEvaluationUpdate = vi.fn()
const mockEvaluationUpdateEq = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function taskFactory(config) {
    return config
  }),
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

const { notifyUsersTask } = await import('@/trigger/notify-users')

describe('notifyUsersTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-resend-api-key'
    process.env.RESEND_FROM_EMAIL = 'jobs@jobfish.ing'
    mockSend.mockResolvedValue({ error: null })
    mockRender.mockResolvedValue('<html />')
    mockEvaluationUpdateEq.mockResolvedValue({ error: null })
    mockJobEvaluationsSelect.mockReturnValue({ in: mockJobEvaluationsIn })
    mockJobEvaluationsIn.mockReturnValue({ is: mockJobEvaluationsIs })
    mockJobEvaluationsIs.mockResolvedValue({ data: [] })
    mockProfilesSelect.mockReturnValue({ in: mockProfilesIn })
    mockProfilesIn.mockResolvedValue({ data: [] })
    mockEvaluationUpdate.mockReturnValue({ eq: mockEvaluationUpdateEq })
  })

  it('sends one email per qualifying evaluation', async () => {
    const evaluations = [
      {
        id: 'evaluation-1',
        score: 8.4,
        reasoning: 'Strong match',
        dimensions: {
          role_fit: 9,
          company_fit: 8,
          location: 8,
          growth_potential: 7,
        },
        user_id: 'user-1',
        jobs: [
          {
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/product',
            source: 'linkedin',
          },
        ],
      },
      {
        id: 'evaluation-2',
        score: 7.6,
        reasoning: 'Another strong match',
        dimensions: {
          role_fit: 8,
          company_fit: 7,
          location: 8,
          growth_potential: 7,
        },
        user_id: 'user-1',
        jobs: [
          {
            title: 'Director of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/director',
            source: 'jobs.ch',
          },
        ],
      },
      {
        id: 'evaluation-3',
        score: 6.9,
        reasoning: 'Below threshold',
        dimensions: {
          role_fit: 7,
          company_fit: 7,
          location: 6,
          growth_potential: 6,
        },
        user_id: 'user-1',
        jobs: [
          {
            title: 'Product Manager',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/pm',
            source: 'company_site',
          },
        ],
      },
    ]

    const profileRow = {
      id: 'user-1',
      threshold: 7,
      notifications_enabled: true,
    }

    mockGetUserById.mockImplementation(async (userId: string) => ({
      data: {
        user: {
          id: userId,
          email: 'user@example.com',
        },
      },
    }))
    mockJobEvaluationsIs.mockResolvedValueOnce({ data: evaluations })
    mockProfilesIn.mockResolvedValueOnce({ data: [profileRow] })

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

    const result = await notifyUsersTask.run({ evaluationIds: ['evaluation-1', 'evaluation-2', 'evaluation-3'] })

    expect(result).toEqual({ notifiedCount: 2 })
    expect(mockJobEvaluationsSelect).toHaveBeenCalledTimes(1)
    expect(mockJobEvaluationsIn).toHaveBeenCalledWith('id', ['evaluation-1', 'evaluation-2', 'evaluation-3'])
    expect(mockJobEvaluationsIs).toHaveBeenCalledWith('notified_at', null)
    expect(mockProfilesSelect).toHaveBeenCalledTimes(1)
    expect(mockProfilesIn).toHaveBeenCalledWith('id', ['user-1'])
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockEvaluationUpdate).toHaveBeenCalledTimes(2)
    expect(mockEvaluationUpdateEq).toHaveBeenCalledTimes(2)
    expect(mockEvaluationUpdateEq).toHaveBeenNthCalledWith(1, 'id', 'evaluation-1')
    expect(mockEvaluationUpdateEq).toHaveBeenNthCalledWith(2, 'id', 'evaluation-2')
    expect(mockEvaluationUpdateEq).not.toHaveBeenCalledWith('id', 'evaluation-3')
    expect(mockEvaluationUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ notified_at: expect.any(String) })
    )
    expect(mockEvaluationUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ notified_at: expect.any(String) })
    )
    expect(mockSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Head of Product at Acme — Score 8.4/10',
      })
    )
    expect(mockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Director of Product at Acme — Score 7.6/10',
      })
    )
  })

  it('returns a consistent object when there are no evaluations to notify about', async () => {
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

    const result = await notifyUsersTask.run({ evaluationIds: ['evaluation-1'] })

    expect(result).toEqual({ notifiedCount: 0 })
    expect(mockJobEvaluationsIn).toHaveBeenCalledWith('id', ['evaluation-1'])
    expect(mockJobEvaluationsIs).toHaveBeenCalledWith('notified_at', null)
    expect(mockProfilesSelect).not.toHaveBeenCalled()
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('surfaces read errors from Supabase queries', async () => {
    mockJobEvaluationsIs.mockResolvedValueOnce({
      data: null,
      error: new Error('job evaluations read failed'),
    })

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

    await expect(
      notifyUsersTask.run({ evaluationIds: ['evaluation-1'] })
    ).rejects.toThrow('job evaluations read failed')
    expect(mockJobEvaluationsIn).toHaveBeenCalledWith('id', ['evaluation-1'])
    expect(mockJobEvaluationsIs).toHaveBeenCalledWith('notified_at', null)
    expect(mockProfilesSelect).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
  })

  it('surfaces read errors from the profiles query', async () => {
    const evaluations = [
      {
        id: 'evaluation-1',
        score: 8.4,
        reasoning: 'Strong match',
        dimensions: {
          role_fit: 9,
          company_fit: 8,
          location: 8,
          growth_potential: 7,
        },
        user_id: 'user-1',
        jobs: [
          {
            title: 'Head of Product',
            company: 'Acme',
            location: 'Zurich',
            url: 'https://example.com/product',
            source: 'linkedin',
          },
        ],
      },
    ]

    mockJobEvaluationsIs.mockResolvedValueOnce({ data: evaluations })
    mockProfilesIn.mockResolvedValueOnce({
      data: null,
      error: new Error('profiles read failed'),
    })

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

    await expect(
      notifyUsersTask.run({ evaluationIds: ['evaluation-1'] })
    ).rejects.toThrow('profiles read failed')
    expect(mockJobEvaluationsIn).toHaveBeenCalledWith('id', ['evaluation-1'])
    expect(mockJobEvaluationsIs).toHaveBeenCalledWith('notified_at', null)
    expect(mockProfilesSelect).toHaveBeenCalledTimes(1)
    expect(mockProfilesIn).toHaveBeenCalledWith('id', ['user-1'])
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockEvaluationUpdate).not.toHaveBeenCalled()
  })
})
