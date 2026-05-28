import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import { JobDigestEmail, truncateReasoning } from '@/lib/email/job-digest'

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

describe('truncateReasoning', () => {
  it('returns the input unchanged when it is at or below the limit', () => {
    expect(truncateReasoning('Short reasoning.')).toBe('Short reasoning.')
  })

  it('returns the input unchanged when it is exactly 80 chars', () => {
    const input = 'a'.repeat(80)
    expect(truncateReasoning(input)).toBe(input)
    expect(truncateReasoning(input).length).toBe(80)
  })

  it('truncates at the last word boundary at or before 80 chars and appends an ellipsis', () => {
    const input =
      'Strong React and payments background, solid product instincts, ships fast, very collaborative.'
    const result = truncateReasoning(input)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(81) // 80 chars + 1 ellipsis
    expect(result).not.toMatch(/\s…$/) // no trailing whitespace before ellipsis
    expect(input.startsWith(result.slice(0, -1))).toBe(true) // prefix is a substring of input
  })

  it('falls back to a hard cut at 80 chars when there is no word boundary in the first 80 chars', () => {
    const input = 'a'.repeat(120)
    const result = truncateReasoning(input)
    expect(result).toBe('a'.repeat(80) + '…')
  })

  it('handles empty input', () => {
    expect(truncateReasoning('')).toBe('')
  })
})

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
