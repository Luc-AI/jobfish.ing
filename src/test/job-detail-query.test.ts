import { describe, it, expect } from 'vitest'
import type { JobDetailData } from '@/lib/supabase/queries'

// These tests validate the shape of data that getJobDetail must return.
// We test the type contract, not the Supabase call itself (which requires a live DB).

describe('JobDetailData type contract', () => {
  it('has all required job fields', () => {
    // Compile-time check: construct a valid JobDetailData object
    const data: JobDetailData = {
      job: {
        id: 'job-1',
        title: 'Head of Product',
        company: 'Acme',
        location: 'Zurich, Switzerland',
        url: 'https://example.com/job',
        source: 'linkedin',
        description: 'Full description text.',
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: {
        id: 'eval-1',
        score: 8.5,
        reasoning: 'Great match.',
        dimensions: {
          role_fit: 9,
          domain_fit: 8,
          experience_fit: 9,
          location_fit: 7,
          upside: 8,
        },
        detailed_reasoning: {
          summary: 'Strong overall fit.',
          strengths: ['Good role overlap'],
          concerns: [],
          red_flags: [],
          recommendation: 'Apply.',
          dimension_explanations: {
            role_fit: 'Scope matches.',
            domain_fit: 'Some ramp-up.',
            experience_fit: 'Aligned.',
            location_fit: 'Acceptable.',
            upside: 'Good growth.',
          },
        },
      },
      action: null,
    }
    expect(data.job.title).toBe('Head of Product')
    expect(data.evaluation?.score).toBe(8.5)
    expect(data.action).toBeNull()
  })

  it('allows evaluation to be null (job exists, no evaluation yet)', () => {
    const data: JobDetailData = {
      job: {
        id: 'job-2',
        title: 'Engineer',
        company: 'Corp',
        location: null,
        url: 'https://example.com/2',
        source: 'greenhouse',
        description: null,
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: null,
      action: null,
    }
    expect(data.evaluation).toBeNull()
  })

  it('allows detailed_reasoning to be null inside an evaluation', () => {
    const data: JobDetailData = {
      job: {
        id: 'job-3',
        title: 'PM',
        company: 'Co',
        location: null,
        url: 'https://example.com/3',
        source: 'lever',
        description: null,
        scraped_at: '2026-04-01T00:00:00Z',
        date_posted: null,
        employment_type: null,
        work_arrangement: null,
        experience_level: null,
        job_language: null,
        working_hours: null,
        source_domain: null,
        detail_facts: null,
      },
      evaluation: {
        id: 'eval-3',
        score: 7.0,
        reasoning: 'Decent fit.',
        dimensions: null,
        detailed_reasoning: null,
      },
      action: { status: 'saved', applied_at: null },
    }
    expect(data.evaluation?.detailed_reasoning).toBeNull()
    expect(data.action?.status).toBe('saved')
  })
})
