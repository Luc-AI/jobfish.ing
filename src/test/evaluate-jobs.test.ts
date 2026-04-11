import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockParseEvaluationResponse = vi.fn()
const mockBuildEvaluationPrompt = vi.fn()
const mockNotifyTrigger = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function taskFactory(config) {
    return config
  }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  buildEvaluationPrompt: mockBuildEvaluationPrompt,
  callOpenRouter: mockCallOpenRouter,
  parseEvaluationResponse: mockParseEvaluationResponse,
}))

vi.mock('@/trigger/notify-users', () => ({
  notifyUsersTask: {
    trigger: mockNotifyTrigger,
  },
}))

const { evaluateJobsTask } = await import('@/trigger/evaluate-jobs')

describe('evaluateJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockBuildEvaluationPrompt.mockReturnValue('prompt')
    mockCallOpenRouter.mockResolvedValue('raw-response')
    mockParseEvaluationResponse.mockReturnValue({
      score: 8.5,
      reasoning: 'Great fit',
      dimensions: {
        role_fit: 9,
        domain_fit: 8,
        experience_fit: 8,
        location_fit: 7,
        upside: 8,
      },
      detailed_reasoning: {
        summary: 'Strong overall fit.',
        strengths: ['Good role overlap'],
        concerns: ['Some ramp-up needed'],
        red_flags: [],
        recommendation: 'Worth applying.',
        dimension_explanations: {
          role_fit: 'Scope matches well.',
          domain_fit: 'Some ramp-up needed.',
          experience_fit: 'Seniority aligned.',
          location_fit: 'Acceptable.',
          upside: 'Good growth potential.',
        },
      },
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: 'job-1',
                  title: 'Head of Product',
                  company: 'Acme',
                  location: 'Zurich',
                  description: 'We need a strong operator.',
                },
              ],
              error: null,
            }),
          }),
        }
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({
                data: [{ id: 'user-1', cv_text: 'Experienced product leader' }],
              }),
            }),
          }),
        }
      }

      if (table === 'preferences') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  user_id: 'user-1',
                  target_roles: ['Head of Product'],
                  industries: ['SaaS'],
                  locations: ['Zurich'],
                  excluded_companies: [],
                },
              ],
            }),
          }),
        }
      }

      if (table === 'job_evaluations') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'evaluation-1' },
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('evaluates jobs without triggering notify-users directly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })

    expect(result).toEqual({ evaluatedCount: 1 })
    expect(mockNotifyTrigger).not.toHaveBeenCalled()
  })
})
