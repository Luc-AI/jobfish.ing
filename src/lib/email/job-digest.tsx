import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

const REASONING_MAX_CHARS = 80

export function truncateReasoning(input: string): string {
  if (input.length <= REASONING_MAX_CHARS) {
    return input
  }
  const window = input.slice(0, REASONING_MAX_CHARS)
  const lastSpace = window.lastIndexOf(' ')
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window
  return `${cut.trimEnd()}…`
}

export interface DigestDimensions {
  role_fit: number
  domain_fit: number
  experience_fit: number
  location_fit: number
  upside: number
}

export interface DigestJobItem {
  jobId: string
  jobTitle: string
  company: string
  location: string | null
  score: number
  dimensions: DigestDimensions | null
  reasoning: string
  applyUrl: string
}

interface JobDigestEmailProps {
  jobs: DigestJobItem[]
  appUrl: string
}

function scoreColor(score: number): string {
  if (score >= 8) return '#15803d'
  if (score >= 6) return '#a16207'
  return '#b91c1c'
}

function formatDimensions(d: DigestDimensions): string {
  return [
    `Role ${Math.round(d.role_fit)}`,
    `Dom ${Math.round(d.domain_fit)}`,
    `Exp ${Math.round(d.experience_fit)}`,
    `Loc ${Math.round(d.location_fit)}`,
    `Upside ${Math.round(d.upside)}`,
  ].join(' · ')
}

function headerCount(count: number): string {
  if (count === 0) return 'no matches this morning'
  return `${count} match${count === 1 ? '' : 'es'} this morning`
}

function HeroCard({
  job,
  appUrl,
  showLabel,
}: {
  job: DigestJobItem
  appUrl: string
  showLabel: boolean
}) {
  return (
    <Section
      style={{
        backgroundColor: '#fafaf9',
        borderRadius: '8px',
        border: '1px solid #e7e5e4',
        padding: '20px',
        margin: '0 0 24px',
      }}
    >
      {showLabel && (
        /*
         * Rendered as literal uppercase rather than via CSS `text-transform`
         * because the digest tests assert on the HTML output, and CSS transforms
         * are invisible to string-based assertions. Email clients render this
         * identically to a CSS-transformed string.
         */
        <Text
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#d97706',
            letterSpacing: '0.06em',
            margin: '0 0 8px',
          }}
        >
          ★ HIGHEST SCORE
        </Text>
      )}

      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ verticalAlign: 'top' }}>
            <Heading
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#1c1917',
                margin: '0 0 4px',
                letterSpacing: '-0.02em',
              }}
            >
              {job.jobTitle}
            </Heading>
            <Text style={{ fontSize: '14px', color: '#57534e', margin: '0' }}>
              {job.company}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
          </td>
          <td
            style={{
              verticalAlign: 'top',
              textAlign: 'right',
              fontSize: '24px',
              fontWeight: 800,
              color: scoreColor(job.score),
              letterSpacing: '-0.03em',
              whiteSpace: 'nowrap',
              paddingLeft: '12px',
            }}
          >
            {job.score.toFixed(1)}
          </td>
        </tr>
      </table>

      {job.dimensions && (
        <Text
          style={{
            fontSize: '13px',
            color: '#78716c',
            margin: '14px 0 8px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDimensions(job.dimensions)}
        </Text>
      )}

      {job.reasoning && (
        <Text style={{ fontSize: '14px', color: '#44403c', lineHeight: '1.5', margin: '0 0 18px' }}>
          {truncateReasoning(job.reasoning)}
        </Text>
      )}

      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ paddingRight: '10px' }}>
            <Button
              href={`${appUrl}/dashboard/jobs/${job.jobId}`}
              style={{
                backgroundColor: '#1c1917',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open in dashboard →
            </Button>
          </td>
          <td>
            <Button
              href={job.applyUrl}
              style={{
                backgroundColor: '#ffffff',
                color: '#1c1917',
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid #d6d3d1',
              }}
            >
              Apply
            </Button>
          </td>
        </tr>
      </table>
    </Section>
  )
}

function TailRow({ job, appUrl }: { job: DigestJobItem; appUrl: string }) {
  const dashboardHref = `${appUrl}/dashboard/jobs/${job.jobId}`
  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ borderBottom: '1px solid #e7e5e4' }}
    >
      <tr>
        <td style={{ padding: '12px 0' }}>
          <Link
            href={dashboardHref}
            style={{
              fontSize: '14px',
              color: '#1c1917',
              textDecoration: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: scoreColor(job.score),
                marginRight: '10px',
              }}
            >
              {job.score.toFixed(1)}
            </span>
            <span>
              {job.jobTitle}
              <span style={{ color: '#78716c' }}>
                {' · '}
                {job.company}
                {job.location ? ` · ${job.location}` : ''}
              </span>
            </span>
          </Link>
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '12px 0' }}>
          <Link
            href={job.applyUrl}
            style={{ fontSize: '13px', color: '#57534e', textDecoration: 'underline' }}
          >
            Apply ↗
          </Link>
        </td>
      </tr>
    </table>
  )
}

function Footer({ appUrl, hasMatches }: { appUrl: string; hasMatches: boolean }) {
  return (
    <>
      {hasMatches && (
        <Section style={{ textAlign: 'center', margin: '24px 0 16px' }}>
          <Button
            href={`${appUrl}/dashboard`}
            style={{
              backgroundColor: '#ffffff',
              color: '#1c1917',
              padding: '10px 18px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid #d6d3d1',
            }}
          >
            View all matches in dashboard →
          </Button>
        </Section>
      )}
      <Hr style={{ borderColor: '#e7e5e4', margin: '24px 0 12px' }} />
      {/*
       * TODO: replace the unsubscribe link's href with a real one-click unsubscribe URL
       * once we have one (e.g., signed token route or Resend webhook). For now it
       * aliases to /notifications so the recipient at least reaches the page where
       * they can disable digest emails. See spec § "Footer" in
       * docs/superpowers/specs/2026-05-28-email-digest-redesign-design.md.
       */}
      <Text style={{ fontSize: '12px', color: '#a8a29e', textAlign: 'center', margin: 0 }}>
        <Link href={`${appUrl}/notifications`} style={{ color: '#a8a29e' }}>
          Notification settings
        </Link>
        {' · '}
        <Link href={`${appUrl}/notifications`} style={{ color: '#a8a29e' }}>
          Unsubscribe
        </Link>
      </Text>
    </>
  )
}

export function JobDigestEmail({ jobs, appUrl }: JobDigestEmailProps) {
  const sortedJobs = [...jobs].sort((a, b) => b.score - a.score)
  const hero = sortedJobs[0]
  const tail = sortedJobs.slice(1)
  const showHeroLabel = sortedJobs.length >= 2

  const preview = hero
    ? `${headerCount(sortedJobs.length)}: ${hero.jobTitle} at ${hero.company}`
    : 'No matches landed today'

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#fafaf9', fontFamily: 'system-ui, sans-serif' }}>
        <Container
          style={{
            maxWidth: '560px',
            margin: '40px auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e7e5e4',
            padding: '32px',
          }}
        >
          <Text style={{ fontSize: '13px', color: '#78716c', margin: '0 0 4px' }}>
            jobfishing · {headerCount(sortedJobs.length)}
          </Text>
          <Hr style={{ borderColor: '#e7e5e4', margin: '12px 0 24px' }} />

          {sortedJobs.length === 0 ? (
            <Text style={{ fontSize: '15px', color: '#57534e', margin: 0 }}>
              No matches landed today, but we&rsquo;ll keep looking.
            </Text>
          ) : (
            <>
              <HeroCard job={hero} appUrl={appUrl} showLabel={showHeroLabel} />

              {tail.length > 0 && (
                <>
                  <Text
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#78716c',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      margin: '0 0 4px',
                    }}
                  >
                    Also matched today
                  </Text>
                  {tail.map(job => (
                    <TailRow key={job.jobId} job={job} appUrl={appUrl} />
                  ))}
                </>
              )}
            </>
          )}

          <Footer appUrl={appUrl} hasMatches={sortedJobs.length > 0} />
        </Container>
      </Body>
    </Html>
  )
}
