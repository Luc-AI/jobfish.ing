// src/test/categorize-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockCallOpenRouter = vi.fn()
const mockCaptureException = vi.fn()
const mockCaptureMessage = vi.fn()

vi.mock('@trigger.dev/sdk', () => ({
  task: vi.fn(function factory(config) { return config }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('@/trigger/lib/evaluate', () => ({
  callOpenRouter: mockCallOpenRouter,
}))

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}))

const { categorizeJobsTask, parseBatchResponse, validateCategories } =
  await import('@/trigger/categorize-jobs')

describe('parseBatchResponse', () => {
  it('parses a clean JSON array', () => {
    const raw = '[{"job_id":"abc","categories":["Engineering"]},{"job_id":"def","categories":["Marketing"]}]'
    expect(parseBatchResponse(raw)).toEqual([
      { job_id: 'abc', categories: ['Engineering'] },
      { job_id: 'def', categories: ['Marketing'] },
    ])
  })

  it('extracts JSON from markdown code block', () => {
    const raw = '```json\n[{"job_id":"abc","categories":["Product"]}]\n```'
    expect(parseBatchResponse(raw)).toEqual([{ job_id: 'abc', categories: ['Product'] }])
  })

  it('throws when no JSON array is present', () => {
    expect(() => parseBatchResponse('Sorry, I cannot help.')).toThrow()
  })
})

describe('validateCategories', () => {
  it('returns valid taxonomy categories unchanged', () => {
    expect(validateCategories(['Engineering', 'AI & Data'])).toEqual(['Engineering', 'AI & Data'])
  })

  it('filters out invalid categories', () => {
    expect(validateCategories(['Engineering', 'Invented Category'])).toEqual(['Engineering'])
  })

  it('caps at 3 categories', () => {
    const input = ['Engineering', 'AI & Data', 'Cybersecurity', 'Product']
    expect(validateCategories(input)).toHaveLength(3)
  })

  it('falls back to ["Other"] when all categories are invalid', () => {
    expect(validateCategories(['NotReal', 'AlsoFake'])).toEqual(['Other'])
  })

  it('falls back to ["Other"] for empty input', () => {
    expect(validateCategories([])).toEqual(['Other'])
  })
})

describe('categorizeJobsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-key'
  })

  it('upserts categories for each job in a successful batch', async () => {
    const jobs = [
      { id: 'job-1', title: 'Senior Engineer', industry: 'Tech', description: 'Build software.' },
      { id: 'job-2', title: 'Marketing Manager', industry: 'Retail', description: 'Grow the brand.' },
    ]
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({ in: async () => ({ data: jobs, error: null }) }),
          update: mockUpdate,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    mockCallOpenRouter.mockResolvedValue(
      '[{"job_id":"job-1","categories":["Engineering"]},{"job_id":"job-2","categories":["Marketing"]}]'
    )

    const result = await (categorizeJobsTask as any).run({ jobIds: ['job-1', 'job-2'] })

    expect(result.categorized).toBe(2)
    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Engineering'] })
    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Marketing'] })
  })

  it('falls back to ["Other"] and captures Sentry warning when per-job LLM fails', async () => {
    const jobs = [{ id: 'job-1', title: 'Mystery Role', industry: null, description: null }]
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => ({ in: async () => ({ data: jobs, error: null }) }),
          update: mockUpdate,
        }
      }
    })

    mockCallOpenRouter.mockRejectedValue(new Error('LLM timeout'))

    await (categorizeJobsTask as any).run({ jobIds: ['job-1'] })

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ jobId: 'job-1' }),
      })
    )
    expect(mockUpdate).toHaveBeenCalledWith({ categories: ['Other'] })
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Job categorized as Other',
      expect.objectContaining({ level: 'warning' })
    )
  })

  it('returns early when no jobs are found', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }))

    const result = await (categorizeJobsTask as any).run({ jobIds: ['nonexistent'] })
    expect(result.categorized).toBe(0)
    expect(mockCallOpenRouter).not.toHaveBeenCalled()
  })
})
