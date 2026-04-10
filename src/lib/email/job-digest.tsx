import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface DigestJobItem {
  jobTitle: string
  company: string
  location: string | null
  score: number
  reasoning: string
  applyUrl: string
  source: string
}

interface JobDigestEmailProps {
  jobs: DigestJobItem[]
}

function scoreColor(score: number): string {
  if (score >= 8) return '#15803d'
  if (score >= 6) return '#a16207'
  return '#b91c1c'
}

function headingForCount(count: number): string {
  if (count === 0) return 'No new job matches this morning'
  return `${count} new job match${count === 1 ? '' : 'es'} this morning`
}

export function JobDigestEmail({ jobs }: JobDigestEmailProps) {
  const firstJob = jobs[0]
  const preview = firstJob
    ? `${headingForCount(jobs.length)}: ${firstJob.jobTitle} at ${firstJob.company}`
    : 'No new job matches this morning'

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
          <Text style={{ fontSize: '12px', color: '#a8a29e', margin: '0 0 12px' }}>
            jobfishing · jobs find you
          </Text>

          <Heading
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#1c1917',
              margin: '0 0 20px',
              letterSpacing: '-0.02em',
            }}
          >
            {headingForCount(jobs.length)}
          </Heading>

          {jobs.length === 0 ? (
            <Text style={{ fontSize: '15px', color: '#57534e', margin: 0 }}>
              No matches landed today, but we'll keep looking.
            </Text>
          ) : (
            jobs.map((job, index) => (
              <Section
                key={`${job.jobTitle}-${job.company}-${index}`}
                style={{
                  backgroundColor: '#fafaf9',
                  borderRadius: '6px',
                  padding: '16px',
                  margin: index === jobs.length - 1 ? 0 : '0 0 16px',
                  border: '1px solid #e7e5e4',
                }}
              >
                <Heading
                  style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#1c1917',
                    margin: '0 0 4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {job.jobTitle}
                </Heading>

                <Text style={{ fontSize: '14px', color: '#57534e', margin: '0 0 12px' }}>
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                  {' · '}
                  <span style={{ color: '#a8a29e', fontSize: '13px' }}>{job.source}</span>
                </Text>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <Text style={{ margin: 0, fontSize: '13px', color: '#78716c', fontWeight: '600' }}>
                    Match score
                  </Text>
                  <Text
                    style={{
                      margin: 0,
                      fontSize: '24px',
                      fontWeight: '800',
                      color: scoreColor(job.score),
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {job.score.toFixed(1)}
                  </Text>
                </div>

                <Text
                  style={{
                    fontSize: '14px',
                    color: '#57534e',
                    fontStyle: 'italic',
                    lineHeight: '1.6',
                    margin: '0 0 18px',
                  }}
                >
                  &ldquo;{job.reasoning}&rdquo;
                </Text>

                <Hr style={{ borderColor: '#e7e5e4', margin: '0 0 18px' }} />

                <Button
                  href={job.applyUrl}
                  style={{
                    backgroundColor: '#1c1917',
                    color: '#ffffff',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    textDecoration: 'none',
                  }}
                >
                  Apply now →
                </Button>
              </Section>
            ))
          )}
        </Container>
      </Body>
    </Html>
  )
}
