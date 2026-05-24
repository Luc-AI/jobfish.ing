// src/test/pre-filter.test.ts
import { describe, it, expect } from 'vitest'
import {
  filterJobsForUser,
  deriveTargetCategories,
  type FilterableJob,
  type UserPrefsForFilter,
} from '@/trigger/lib/pre-filter'

const makeJob = (overrides: Partial<FilterableJob> = {}): FilterableJob => ({
  title: 'Senior UX Designer',
  company: 'Logitech',
  industry: 'IT & Software',
  categories: ['product'],
  ...overrides,
})

const emptyPrefs: UserPrefsForFilter = {
  target_roles: [],
  excluded_companies: [],
  excluded_industries: [],
}

describe('deriveTargetCategories', () => {
  it('returns ["product"] for Product Manager', () => {
    expect(deriveTargetCategories([{ role: 'Product Manager' }])).toEqual(['product'])
  })

  it('returns ["engineering"] for Machine Learning Engineer', () => {
    expect(deriveTargetCategories([{ role: 'Machine Learning Engineer' }])).toEqual(['engineering'])
  })

  it('returns [] for empty roles array', () => {
    expect(deriveTargetCategories([])).toEqual([])
  })

  it('returns multiple categories when roles span categories', () => {
    const result = deriveTargetCategories([
      { role: 'Product Manager' },
      { role: 'Software Engineer' },
    ])
    expect(result).toContain('product')
    expect(result).toContain('engineering')
    expect(result).toHaveLength(2)
  })

  it('deduplicates categories when multiple roles map to the same category', () => {
    const result = deriveTargetCategories([
      { role: 'Product Manager' },
      { role: 'Product Designer' },
    ])
    expect(result).toEqual(['product'])
  })

  it('ignores unrecognised roles silently', () => {
    expect(deriveTargetCategories([{ role: 'Wizard of Cheese' }])).toEqual([])
  })
})

describe('filterJobsForUser — category overlap', () => {
  it('passes job when categories overlap with target roles', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Product Manager' }],
    }
    const job = makeJob({ categories: ['product'] })
    expect(filterJobsForUser([job], prefs)).toHaveLength(1)
  })

  it('blocks job when categories do not overlap with target roles', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Product Manager' }],
    }
    const job = makeJob({ categories: ['marketing'] })
    expect(filterJobsForUser([job], prefs)).toHaveLength(0)
  })

  it('fail-open: passes job when categories is null, regardless of target roles', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Product Manager' }],
    }
    const job = makeJob({ categories: null })
    expect(filterJobsForUser([job], prefs)).toHaveLength(1)
  })

  it('fail-open: passes job when categories is empty array, regardless of target roles', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Product Manager' }],
    }
    const job = makeJob({ categories: [] })
    expect(filterJobsForUser([job], prefs)).toHaveLength(1)
  })

  it('fail-open: passes all jobs when target_roles is empty', () => {
    const jobs = [
      makeJob({ categories: ['product'] }),
      makeJob({ categories: ['engineering'] }),
      makeJob({ categories: null }),
    ]
    expect(filterJobsForUser(jobs, emptyPrefs)).toHaveLength(3)
  })

  it('passes job matching any of multiple target role categories (OR logic)', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Product Manager' }, { role: 'Software Engineer' }],
    }
    const engineeringJob = makeJob({ categories: ['engineering'] })
    const productJob = makeJob({ categories: ['product'] })
    const marketingJob = makeJob({ categories: ['marketing'] })
    expect(filterJobsForUser([engineeringJob, productJob, marketingJob], prefs)).toHaveLength(2)
  })
})

describe('filterJobsForUser — company exclusion', () => {
  it('blocks job from excluded company', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['Logitech'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('is case-insensitive for company matching', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['logitech'] }
    expect(filterJobsForUser([makeJob({ company: 'Logitech' })], prefs)).toHaveLength(0)
  })

  it('passes job from non-excluded company', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_companies: ['Adecco'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
  })
})

describe('filterJobsForUser — industry exclusion', () => {
  it('blocks job from excluded industry', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software'] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('always passes jobs with industry = "Other"', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      excluded_industries: ['IT & Software', 'Other'],
    }
    expect(filterJobsForUser([makeJob({ industry: 'Other' })], prefs)).toHaveLength(1)
  })

  it('always passes jobs with industry = null', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software'] }
    expect(filterJobsForUser([makeJob({ industry: null })], prefs)).toHaveLength(1)
  })

  it('is case-insensitive for industry matching', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['it & software'] }
    expect(filterJobsForUser([makeJob({ industry: 'IT & Software' })], prefs)).toHaveLength(0)
  })
})

describe('filterJobsForUser — combined conditions', () => {
  it('applies all three conditions together', () => {
    const prefs: UserPrefsForFilter = {
      target_roles: [{ role: 'Product Designer' }],
      excluded_companies: ['Adecco'],
      excluded_industries: ['Healthcare & Pharma'],
    }
    const jobs = [
      makeJob({ categories: ['product'], company: 'Logitech', industry: 'IT & Software' }),           // PASS
      makeJob({ categories: ['engineering'], company: 'Logitech', industry: 'IT & Software' }),        // FAIL category
      makeJob({ categories: ['product'], company: 'Adecco', industry: 'IT & Software' }),              // FAIL company
      makeJob({ categories: ['product'], company: 'Logitech', industry: 'Healthcare & Pharma' }),      // FAIL industry
    ]
    expect(filterJobsForUser(jobs, prefs)).toHaveLength(1)
    expect(filterJobsForUser(jobs, prefs)[0].company).toBe('Logitech')
  })

  it('fail-open: null categories job passes category check even with exclusions active', () => {
    const prefs: UserPrefsForFilter = {
      target_roles: [{ role: 'Product Manager' }],
      excluded_companies: ['Adecco'],
      excluded_industries: [],
    }
    const job = makeJob({ categories: null, company: 'Logitech' })
    expect(filterJobsForUser([job], prefs)).toHaveLength(1)
  })
})
