import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  normalizeFantasticJob,
  buildApifyInput,
  toApifyLocation,
  scrapeAll,
} from '@/trigger/lib/apify'

describe('toApifyLocation', () => {
  it('maps known city to City, Country format', () => {
    expect(toApifyLocation('Zurich')).toBe('Zurich, Switzerland')
    expect(toApifyLocation('Berlin')).toBe('Berlin, Germany')
    expect(toApifyLocation('London')).toBe('London, United Kingdom')
  })

  it('returns the input unchanged for unknown locations', () => {
    expect(toApifyLocation('SomeUnknownCity')).toBe('SomeUnknownCity')
  })
})

describe('normalizeFantasticJob', () => {
  it('maps a full career site item to NormalizedJob', () => {
    const raw = {
      title: 'Head of Product',
      organization: 'Acme Corp',
      url: 'https://jobs.acme.com/head-of-product',
      source: 'greenhouse',
      description_text: 'We are looking for a Head of Product...',
      locations_derived: [{ city: 'Zurich', country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job).not.toBeNull()
    expect(job!.title).toBe('Head of Product')
    expect(job!.company).toBe('Acme Corp')
    expect(job!.url).toBe('https://jobs.acme.com/head-of-product')
    expect(job!.source).toBe('greenhouse')
    expect(job!.description).toBe('We are looking for a Head of Product...')
    expect(job!.location).toBe('Zurich, Switzerland')
  })

  it('returns null when url is missing', () => {
    const raw = {
      title: 'Engineer',
      organization: 'Acme',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('returns null when title is missing', () => {
    const raw = {
      organization: 'Acme',
      url: 'https://jobs.acme.com/1',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('returns null when organization is missing', () => {
    const raw = {
      title: 'Engineer',
      url: 'https://jobs.acme.com/1',
      locations_derived: [],
    }
    expect(normalizeFantasticJob(raw)).toBeNull()
  })

  it('falls back to Remote when remote_derived is true and no derived location', () => {
    const raw = {
      title: 'Remote Engineer',
      organization: 'Acme',
      url: 'https://jobs.acme.com/2',
      source: 'lever',
      description_text: null,
      locations_derived: [],
      remote_derived: true,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.location).toBe('Remote')
  })

  it('falls back to locations_alt_raw when derived is empty and not remote', () => {
    const raw = {
      title: 'Engineer',
      organization: 'Acme',
      url: 'https://jobs.acme.com/3',
      source: 'workday',
      description_text: null,
      locations_derived: [],
      locations_alt_raw: ['Basel, Switzerland'],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.location).toBe('Basel, Switzerland')
  })

  it('maps employment_type from ai_employment_type', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/1',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_employment_type: ['full-time'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.employment_type).toEqual(['full-time'])
  })

  it('maps employment_type from employment_type when ai_employment_type is absent', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/2',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      employment_type: ['contract'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.employment_type).toEqual(['contract'])
  })

  it('sets work_arrangement from ai_work_arrangement', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/3',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_work_arrangement: 'hybrid',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.work_arrangement).toBe('hybrid')
  })

  it('falls back work_arrangement to "remote" when ai_work_arrangement is null and remote_derived is true', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/4',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: true,
      ai_work_arrangement: null,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.work_arrangement).toBe('remote')
  })

  it('maps experience_level from ai_experience_level', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/5',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_experience_level: 'senior',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.experience_level).toBe('senior')
  })

  it('maps working_hours from ai_working_hours', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/6',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_working_hours: 40,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.working_hours).toBe(40)
  })

  it('maps source_domain', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/7',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      source_domain: 'linkedin.com',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.source_domain).toBe('linkedin.com')
  })

  it('builds detail_facts.location_display from locations_derived city, region, and country', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/8',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [{ city: 'Olten', region: 'Solothurn', country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.location_display).toBe('Olten, Solothurn, Switzerland')
  })

  it('builds detail_facts.location_display omitting null segments', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/9',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [{ city: 'Zurich', region: null, country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.location_display).toBe('Zurich, Switzerland')
  })

  it('sets detail_facts.key_skills from ai_key_skills', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/10',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_key_skills: ['Roadmapping', 'Stakeholder management'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.key_skills).toEqual(['Roadmapping', 'Stakeholder management'])
  })

  it('sets detail_facts.core_responsibilities from ai_core_responsibilities', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/11',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_core_responsibilities: 'Own the product roadmap.',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.core_responsibilities).toBe('Own the product roadmap.')
  })

  it('sets detail_facts.requirements_summary from ai_requirements_summary', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/12',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_requirements_summary: '5+ years experience.',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.requirements_summary).toBe('5+ years experience.')
  })

  it('leaves detail_facts null when no enriched fields are present', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/13',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts).toBeNull()
  })

  it('maps job_language from ai_job_language', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/14',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_job_language: 'English',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.job_language).toBe('English')
  })

  it('sets detail_facts.education_requirements from ai_education_requirements', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/15',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_education_requirements: ['postgraduate degree'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.education_requirements).toEqual(['postgraduate degree'])
  })

  it('sets detail_facts.keywords from ai_keywords', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/16',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_keywords: ['Product Manager', 'SaaS'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.keywords).toEqual(['Product Manager', 'SaaS'])
  })

  it('sets work_arrangement to null when ai_work_arrangement is absent and remote_derived is false', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/17',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.work_arrangement).toBeNull()
  })

  it('falls back employment_type to raw field when ai_employment_type is explicitly null', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/18',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_employment_type: null,
      employment_type: ['part-time'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.employment_type).toEqual(['part-time'])
  })
})

describe('buildApifyInput', () => {
  it('merges target_roles from all preferences into titleSearch', () => {
    const prefs = [
      { target_roles: ['Head of Product', 'VP Product'], locations: ['Zurich'], excluded_companies: [] },
      { target_roles: ['Head of Product', 'COO'], locations: ['Berlin'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.titleSearch).toContain('Head of Product')
    expect(input.titleSearch).toContain('VP Product')
    expect(input.titleSearch).toContain('COO')
    // deduped
    expect(input.titleSearch.filter(r => r === 'Head of Product').length).toBe(1)
  })

  it('maps and deduplicates locations, strips Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Zurich', 'Remote'], excluded_companies: [] },
      { target_roles: ['Engineer'], locations: ['Zurich', 'Berlin'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.locationSearch).toContain('Zurich, Switzerland')
    expect(input.locationSearch).toContain('Berlin, Germany')
    expect(input.locationSearch).not.toContain('Remote')
    expect(input.locationSearch.filter(l => l === 'Zurich, Switzerland').length).toBe(1)
  })

  it('sets aiWorkArrangementFilter when any user wants Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Remote'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.aiWorkArrangementFilter).toEqual(['Remote OK', 'Remote Solely'])
  })

  it('omits aiWorkArrangementFilter when no user wants Remote', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: ['Zurich'], excluded_companies: [] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.aiWorkArrangementFilter).toBeUndefined()
  })

  it('merges excluded_companies into organizationExclusionSearch', () => {
    const prefs = [
      { target_roles: ['Engineer'], locations: [], excluded_companies: ['Acme', 'BigCorp'] },
      { target_roles: ['Engineer'], locations: [], excluded_companies: ['Acme', 'MegaCorp'] },
    ]
    const input = buildApifyInput(prefs)
    expect(input.organizationExclusionSearch).toContain('Acme')
    expect(input.organizationExclusionSearch).toContain('BigCorp')
    expect(input.organizationExclusionSearch).toContain('MegaCorp')
    expect(input.organizationExclusionSearch.filter(c => c === 'Acme').length).toBe(1)
  })

  it('includes fixed params on every call', () => {
    const prefs = [{ target_roles: ['Engineer'], locations: ['Zurich'], excluded_companies: [] }]
    const input = buildApifyInput(prefs)
    expect(input.timeRange).toBe('1h')
    expect(input.limit).toBe(200)
    expect(input.descriptionType).toBe('text')
    expect(input.includeAi).toBe(true)
    expect(input.removeAgency).toBe(true)
  })

  it('defaults timeRange to 1h', () => {
    const prefs = [{ target_roles: ['PM'], locations: ['Zurich, Switzerland'], excluded_companies: [] }]
    const input = buildApifyInput(prefs)
    expect(input.timeRange).toBe('1h')
  })

  it('accepts a custom timeRange', () => {
    const prefs = [{ target_roles: ['PM'], locations: ['Zurich, Switzerland'], excluded_companies: [] }]
    const input = buildApifyInput(prefs, '7d')
    expect(input.timeRange).toBe('7d')
  })

  it('passes timeRange through unchanged', () => {
    const prefs = [{ target_roles: ['PM'], locations: ['Zurich, Switzerland'], excluded_companies: [] }]
    const input = buildApifyInput(prefs, '24h')
    expect(input.timeRange).toBe('24h')
  })
})

describe('scrapeAll', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    delete process.env.APIFY_API_TOKEN
    vi.unstubAllGlobals()
  })

  it('calls both actors with correct endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const prefs = [{ target_roles: ['Engineer'], locations: [], excluded_companies: [] }]
    await scrapeAll(prefs)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('career-site-job-listing-api'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('advanced-linkedin-job-search-api'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws when APIFY_API_TOKEN is not set', async () => {
    delete process.env.APIFY_API_TOKEN
    vi.stubGlobal('fetch', vi.fn())
    await expect(
      scrapeAll([{ target_roles: ['Engineer'], locations: [], excluded_companies: [] }])
    ).rejects.toThrow('APIFY_API_TOKEN is not set')
  })

  it('passes Authorization header with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const prefs = [{ target_roles: ['Engineer'], locations: [], excluded_companies: [] }]
    await scrapeAll(prefs)

    // Verify both calls include Authorization header
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    )
  })

  it('returns combined jobs from both actors', async () => {
    const mockItem = {
      title: 'Head of Product',
      organization: 'Acme',
      url: 'https://example.com/job/1',
      source: 'greenhouse',
      description_text: 'Great role',
      locations_derived: [{ city: 'Zurich', country: 'Switzerland' }],
      remote_derived: false,
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockItem]),
      }),
    )

    const prefs = [{ target_roles: ['Head of Product'], locations: ['Zurich'], excluded_companies: [] }]
    const jobs = await scrapeAll(prefs)

    expect(jobs).toHaveLength(2)
    expect(jobs[0].title).toBe('Head of Product')
  })

  it('returns partial results when one actor fails', async () => {
    const mockItem = {
      title: 'Engineer',
      organization: 'Co',
      url: 'https://example.com/job/2',
      source: 'lever',
      description_text: null,
      locations_derived: [],
      remote_derived: true,
    }

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([mockItem]) })
        }
        return Promise.reject(new Error('Network error'))
      }),
    )

    const prefs = [{ target_roles: ['Engineer'], locations: [], excluded_companies: [] }]
    const jobs = await scrapeAll(prefs)

    expect(jobs).toHaveLength(1)
    expect(jobs[0].company).toBe('Co')
  })

  it('returns empty array when both actors fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const prefs = [{ target_roles: ['Engineer'], locations: [], excluded_companies: [] }]
    const jobs = await scrapeAll(prefs)

    expect(jobs).toHaveLength(0)
  })

  it('returns empty array when all preferences have no target_roles', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const prefs = [{ target_roles: [], locations: ['Zurich'], excluded_companies: [] }]
    const jobs = await scrapeAll(prefs)
    expect(jobs).toHaveLength(0)
    // fetch should never have been called
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
