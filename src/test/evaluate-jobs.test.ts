// src/test/evaluate-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockParseEvaluationResponse = vi.fn()
const mockBuildEvaluationPrompt = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function taskFactory(config) { return config }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  buildEvaluationPrompt: mockBuildEvaluationPrompt,
  callOpenRouter: mockCallOpenRouter,
  parseEvaluationResponse: mockParseEvaluationResponse,
}))

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/trigger/send-instant-alert', () => ({
  sendInstantAlertTask: { trigger: vi.fn() },
}))

const { evaluateJobsTask } = await import('@/trigger/evaluate-jobs')

const mockEvalResult = {
  score: 8.5,
  reasoning: 'Great fit',
  dimensions: { role_fit: 9, domain_fit: 8, experience_fit: 8, location_fit: 7, upside: 8 },
  detailed_reasoning: {
    summary: 'Strong match.',
    strengths: ['Good overlap'],
    concerns: [],
    red_flags: [],
    recommendation: 'Apply.',
    dimension_explanations: {
      role_fit: 'Matches.', domain_fit: 'Close.', experience_fit: 'Aligned.',
      location_fit: 'Fine.', upside: 'Good.',
    },
  },
}

// Returns a Supabase-style chainable query stub where every filter method
// returns the chain itself, and awaiting it resolves `result`.
function makeChainable(result: { data: any[]; error: null | { message: string } }) {
  const chain: Record<string, any> = {}
  chain.in  = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lt  = vi.fn(() => chain)
  chain.then = (
    resolve: (v: typeof result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return chain
}

let jobsChain: ReturnType<typeof makeChainable>

function setupMocks({
  jobs = [{ id: 'job-1', title: 'Head of Product', company: 'Acme', location: 'Zurich', description: 'Strong operator.', industry: 'IT & Software' }],
  prefs = { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: ['SaaS'], locations: ['Zurich'], excluded_companies: [] as string[], excluded_industries: [] as string[] },
} = {}) {
  jobsChain = makeChainable({ data: jobs, error: null })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'jobs') {
      return { select: () => ({ eq: () => jobsChain }) }
    }
    if (table === 'profiles') {
      const profileResult = { data: [{ id: 'user-1', cv_text: 'PM background', years_experience: 0 }], error: null }
      const chain = makeChainable(profileResult)
      return { select: () => ({ eq: () => chain }) }
    }
    if (table === 'preferences') {
      return { select: () => ({ in: async () => ({ data: [prefs] }) }) }
    }
    if (table === 'job_evaluations') {
      return {
        insert: async () => ({ data: { id: 'eval-1' }, error: null }),
        upsert: async () => ({ data: { id: 'eval-1' }, error: null }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('evaluateJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    mockBuildEvaluationPrompt.mockReturnValue('prompt')
    mockCallOpenRouter.mockResolvedValue('raw')
    mockParseEvaluationResponse.mockReturnValue(mockEvalResult)
    setupMocks()
  })

  it('evaluates a matching job and returns count', async () => {
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 1 })
  })

  it('skips evaluation when job is pre-filtered out by company exclusion', async () => {
    setupMocks({ prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: [], locations: [], excluded_companies: ['Acme'], excluded_industries: [] } })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('skips evaluation when job title does not match target roles', async () => {
    setupMocks({
      jobs: [{ id: 'job-1', title: 'Data Engineer', company: 'Acme', location: 'Zurich', description: 'Data stuff.', industry: 'IT & Software' }],
      prefs: { user_id: 'user-1', target_roles: [{ role: 'Head of Product' }], target_industries: [], locations: [], excluded_companies: [], excluded_industries: [] },
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })

  it('returns 0 when no jobs exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        const empty = makeChainable({ data: [], error: null })
        return { select: () => ({ eq: () => empty }) }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    const result = await (evaluateJobsTask as any).run({ jobIds: ['job-1'] })
    expect(result).toMatchObject({ evaluatedCount: 0 })
  })

  it('fetches 100 most recent jobs when no jobIds provided (new user backfill)', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'] })
    expect(mockBuildEvaluationPrompt).toHaveBeenCalled()
  })

  // ── New tests for since / until / phase ──────────────────────────────────

  it('uses since as the date_posted lower bound when provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-21' })
    expect(jobsChain.gte).toHaveBeenCalledWith('date_posted', '2026-05-21')
  })

  it('adds lt filter for until when provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-15', until: '2026-05-21' })
    expect(jobsChain.gte).toHaveBeenCalledWith('date_posted', '2026-05-15')
    expect(jobsChain.lt).toHaveBeenCalledWith('date_posted', '2026-05-21')
  })

  it('does not call lt when until is not provided', async () => {
    setupMocks()
    await (evaluateJobsTask as any).run({ userIds: ['user-1'], since: '2026-05-21' })
    expect(jobsChain.lt).not.toHaveBeenCalled()
  })

  it('captures a Sentry warning when phase is onboarding-2 and errors occurred', async () => {
    const sentry = await import('@sentry/node')
    mockCallOpenRouter.mockRejectedValue(new Error('rate limit'))
    await (evaluateJobsTask as any).run({
      userIds: ['user-1'],
      since: '2026-05-15',
      until: '2026-05-21',
      phase: 'onboarding-2',
    })
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'onboarding phase-2: evaluation errors',
      expect.objectContaining({ level: 'warning' }),
    )
  })

  it('does not capture Sentry warning for cron phase even with errors', async () => {
    const sentry = await import('@sentry/node')
    mockCallOpenRouter.mockRejectedValue(new Error('rate limit'))
    await (evaluateJobsTask as any).run({
      userIds: ['user-1'],
      since: '2026-05-15',
      phase: 'cron',
    })
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })
})
