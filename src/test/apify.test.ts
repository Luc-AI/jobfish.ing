import { describe, it, expect } from 'vitest'
import { normalizeApifyJob } from '@/trigger/lib/apify'

describe('normalizeApifyJob', () => {
  it('maps LinkedIn actor output to job shape', () => {
    const raw = {
      title: 'Head of Product',
      companyName: 'Acme Corp',
      location: 'Zurich, Switzerland',
      jobUrl: 'https://linkedin.com/jobs/view/123',
      description: 'We are hiring...',
    }
    const job = normalizeApifyJob('linkedin', raw)
    expect(job.title).toBe('Head of Product')
    expect(job.company).toBe('Acme Corp')
    expect(job.url).toBe('https://linkedin.com/jobs/view/123')
    expect(job.source).toBe('linkedin')
  })

  it('returns null for items missing url', () => {
    const raw = { title: 'Some Job', companyName: 'Co' }
    expect(normalizeApifyJob('linkedin', raw)).toBeNull()
  })
})
