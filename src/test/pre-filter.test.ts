// src/test/pre-filter.test.ts
import { describe, it, expect } from 'vitest'
import { filterJobsForUser, type FilterableJob, type UserPrefsForFilter } from '@/trigger/lib/pre-filter'

const makeJob = (overrides: Partial<FilterableJob> = {}): FilterableJob => ({
  title: 'Senior UX Designer',
  company: 'Logitech',
  industry: 'IT & Software',
  ...overrides,
})

const emptyPrefs: UserPrefsForFilter = {
  target_roles: [],
  excluded_companies: [],
  excluded_industries: [],
}

describe('filterJobsForUser — title keyword match', () => {
  it('passes job when title matches a target role (case-insensitive)', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'UX Designer' }] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
  })

  it('blocks job when title does not match any target role', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'Data Engineer' }] }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(0)
  })

  it('matches case-insensitively', () => {
    const prefs: UserPrefsForFilter = { ...emptyPrefs, target_roles: [{ role: 'ux designer' }] }
    expect(filterJobsForUser([makeJob({ title: 'Senior UX Designer' })], prefs)).toHaveLength(1)
  })

  it('passes all jobs when target_roles is empty (no keyword filter)', () => {
    expect(filterJobsForUser([makeJob(), makeJob({ title: 'Data Engineer' })], emptyPrefs)).toHaveLength(2)
  })

  it('matches on any of multiple target roles (OR logic)', () => {
    const prefs: UserPrefsForFilter = {
      ...emptyPrefs,
      target_roles: [{ role: 'Data Engineer' }, { role: 'UX Designer' }],
    }
    expect(filterJobsForUser([makeJob()], prefs)).toHaveLength(1)
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
    const prefs: UserPrefsForFilter = { ...emptyPrefs, excluded_industries: ['IT & Software', 'Other'] }
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
      target_roles: [{ role: 'UX Designer' }],
      excluded_companies: ['Adecco'],
      excluded_industries: ['Healthcare & Pharma'],
    }
    const jobs = [
      makeJob({ title: 'UX Designer', company: 'Logitech', industry: 'IT & Software' }),  // PASS
      makeJob({ title: 'Data Engineer', company: 'Logitech', industry: 'IT & Software' }), // FAIL title
      makeJob({ title: 'UX Designer', company: 'Adecco', industry: 'IT & Software' }),     // FAIL company
      makeJob({ title: 'UX Designer', company: 'Logitech', industry: 'Healthcare & Pharma' }), // FAIL industry
    ]
    expect(filterJobsForUser(jobs, prefs)).toHaveLength(1)
    expect(filterJobsForUser(jobs, prefs)[0].company).toBe('Logitech')
  })
})
