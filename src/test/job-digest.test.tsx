import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import { JobDigestEmail, truncateReasoning } from '@/lib/email/job-digest'

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

const heroJob = {
  jobId: 'job-hero',
  jobTitle: 'Senior Product Engineer',
  company: 'Stripe',
  location: 'Zurich (remote)',
  score: 8.7,
  dimensions: {
    role_fit: 9,
    domain_fit: 8,
    experience_fit: 9,
    location_fit: 10,
    upside: 7,
  },
  reasoning: 'Strong React + payments background match.',
  applyUrl: 'https://example.com/apply/hero',
}

const tailJob = {
  jobId: 'job-tail',
  jobTitle: 'Staff Frontend Engineer',
  company: 'Smallpdf',
  location: 'Zurich',
  score: 7.2,
  dimensions: {
    role_fit: 8,
    domain_fit: 6,
    experience_fit: 8,
    location_fit: 9,
    upside: 5,
  },
  reasoning: 'Solid fit, smaller company than usual.',
  applyUrl: 'https://example.com/apply/tail',
}

const appUrl = 'https://jobfish.ing'

describe('JobDigestEmail', () => {
  it('renders the empty state when there are no matches', async () => {
    const html = await render(<JobDigestEmail jobs={[]} appUrl={appUrl} />)
    expect(html).toContain('No matches landed today')
    expect(html).not.toContain('HIGHEST SCORE')
    expect(html).not.toContain('Also matched today')
    expect(html).not.toContain('View all matches in dashboard')
  })

  it('renders a single match without the HIGHEST SCORE label and without the tail section', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Senior Product Engineer')
    expect(html).not.toContain('HIGHEST SCORE')
    expect(html).not.toContain('Also matched today')
    expect(html).toContain('View all matches in dashboard')
  })

  it('renders the HIGHEST SCORE label and the tail when there are 2+ matches', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain('HIGHEST SCORE')
    expect(html).toContain('Also matched today')
    expect(html).toContain('Senior Product Engineer')
    expect(html).toContain('Staff Frontend Engineer')
  })

  it('renders the dimensions breakdown row when dimensions are present', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Role 9')
    expect(html).toContain('Dom 8')
    expect(html).toContain('Exp 9')
    expect(html).toContain('Loc 10')
    expect(html).toContain('Upside 7')
  })

  it('omits the dimensions row when dimensions are null', async () => {
    const html = await render(
      <JobDigestEmail jobs={[{ ...heroJob, dimensions: null }]} appUrl={appUrl} />
    )
    expect(html).not.toContain('Role')
    expect(html).not.toContain('Upside')
  })

  it('renders the dashboard primary CTA and the external apply secondary CTA in the hero', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain('Open in dashboard')
    expect(html).toContain(`${appUrl}/dashboard/jobs/${heroJob.jobId}`)
    expect(html).toContain(heroJob.applyUrl)
  })

  it('tail rows link the row to the dashboard and provide a separate external apply link', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain(`${appUrl}/dashboard/jobs/${tailJob.jobId}`)
    expect(html).toContain(tailJob.applyUrl)
  })

  it('does not render the source anywhere', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html.toLowerCase()).not.toContain('linkedin')
    expect(html.toLowerCase()).not.toContain('jobs.ch')
    expect(html.toLowerCase()).not.toContain('via ')
  })

  it('renders a footer link to the dashboard root when there is at least one match', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob]} appUrl={appUrl} />)
    expect(html).toContain(`${appUrl}/dashboard`)
    expect(html).toContain('View all matches in dashboard')
  })

  it('shows the count in the header', async () => {
    const html = await render(<JobDigestEmail jobs={[heroJob, tailJob]} appUrl={appUrl} />)
    expect(html).toContain('2 matches')
  })
})
