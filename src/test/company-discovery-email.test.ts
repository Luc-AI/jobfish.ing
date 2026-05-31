// src/test/company-discovery-email.test.ts
import { describe, expect, it } from 'vitest'
import { buildDiscoveryEmail } from '@/lib/companies/discovery-email'

describe('buildDiscoveryEmail', () => {
  it('uses singular subject for one company', () => {
    const { subject } = buildDiscoveryEmail(
      [{ name: 'Acme', source: 'apify_linkedin', sampleJobUrl: null }],
      '2026-05-30',
    )
    expect(subject).toBe('Jobfish — 1 new company discovered (2026-05-30)')
  })

  it('uses plural subject for multiple companies', () => {
    const { subject } = buildDiscoveryEmail(
      [
        { name: 'Acme', source: 'apify_linkedin', sampleJobUrl: null },
        { name: 'Nimbus', source: 'apify_career_site', sampleJobUrl: null },
      ],
      '2026-05-30',
    )
    expect(subject).toBe('Jobfish — 2 new companies discovered (2026-05-30)')
  })

  it('renders a friendly source label and a link when a sample url exists', () => {
    const { html } = buildDiscoveryEmail(
      [{ name: 'Acme', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' }],
      '2026-05-30',
    )
    expect(html).toContain('Acme')
    expect(html).toContain('LinkedIn')
    expect(html).toContain('href="https://x/1"')
  })

  it('escapes company names', () => {
    const { html } = buildDiscoveryEmail(
      [{ name: 'A & B <Co>', source: 'apify_career_site', sampleJobUrl: null }],
      '2026-05-30',
    )
    expect(html).toContain('A &amp; B &lt;Co&gt;')
    expect(html).toContain('Career site')
  })
})
