import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import { JobDigestEmail } from '@/lib/email/job-digest'

const mockJobs = [
  {
    jobTitle: 'Head of Product',
    company: 'Acme Corp',
    location: 'Zurich',
    score: 8.5,
    reasoning: 'Strong product leadership background.',
    applyUrl: 'https://example.com/apply/head-of-product',
    source: 'LinkedIn',
  },
  {
    jobTitle: 'Senior Product Manager',
    company: 'Northwind',
    location: 'Remote',
    score: 7.2,
    reasoning: 'Great match for shipping at scale.',
    applyUrl: 'https://example.com/apply/senior-product-manager',
    source: 'Wellfound',
  },
]

const singleJob = [mockJobs[0]]

describe('JobDigestEmail', () => {
  it('renders a pluralized summary heading', async () => {
    const html = await render(<JobDigestEmail jobs={mockJobs} />)
    expect(html).toContain('2 new job matches this morning')
  })

  it('renders a singular summary heading', async () => {
    const html = await render(<JobDigestEmail jobs={singleJob} />)
    expect(html).toContain('1 new job match this morning')
  })

  it('renders multiple job titles', async () => {
    const html = await render(<JobDigestEmail jobs={mockJobs} />)
    expect(html).toContain('Head of Product')
    expect(html).toContain('Senior Product Manager')
  })

  it('renders an empty state for no matches', async () => {
    const html = await render(<JobDigestEmail jobs={[]} />)
    expect(html).toContain('No new job matches this morning')
    expect(html).toContain('No matches landed today, but we&#x27;ll keep looking.')
  })

  it('renders scores and apply links', async () => {
    const html = await render(<JobDigestEmail jobs={mockJobs} />)
    expect(html).toContain('8.5')
    expect(html).toContain('7.2')
    expect(html).toContain('https://example.com/apply/head-of-product')
    expect(html).toContain('https://example.com/apply/senior-product-manager')
  })
})
