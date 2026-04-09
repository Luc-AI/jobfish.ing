import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import { JobNotificationEmail } from '@/lib/email/job-notification'

const mockProps = {
  jobTitle: 'Head of Product',
  company: 'Acme Corp',
  location: 'Zurich',
  score: 8.5,
  reasoning: 'Strong match due to product background.',
  dimensions: {
    role_fit: 9.0,
    company_fit: 8.0,
    location: 9.0,
    growth_potential: 8.0,
  },
  applyUrl: 'https://example.com/apply',
  source: 'LinkedIn',
}

describe('JobNotificationEmail', () => {
  it('renders job title in the email', async () => {
    const html = await render(<JobNotificationEmail {...mockProps} />)
    expect(html).toContain('Head of Product')
  })

  it('renders company name', async () => {
    const html = await render(<JobNotificationEmail {...mockProps} />)
    expect(html).toContain('Acme Corp')
  })

  it('renders score', async () => {
    const html = await render(<JobNotificationEmail {...mockProps} />)
    expect(html).toContain('8.5')
  })

  it('includes apply link', async () => {
    const html = await render(<JobNotificationEmail {...mockProps} />)
    expect(html).toContain('https://example.com/apply')
  })
})
