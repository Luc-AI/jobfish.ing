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

export interface AlertJobItem {
  jobTitle: string
  company: string
  location: string | null
  score: number
  reasoning: string
  applyUrl: string
  source: string
}

export function getAlertSubject(count: number): string {
  return `🔥 ${count} hot job match${count === 1 ? '' : 'es'} — act now`
}

function scoreColor(score: number): string {
  if (score >= 9) return '#d97706'   // amber — hot
  if (score >= 7) return '#15803d'   // green
  return '#b91c1c'                    // red
}

interface JobAlertEmailProps {
  jobs: AlertJobItem[]
}

export function JobAlertEmail({ jobs }: JobAlertEmailProps) {
  const firstJob = jobs[0]
  const preview = firstJob
    ? `Hot match: ${firstJob.jobTitle} at ${firstJob.company} — score ${firstJob.score}`
    : 'Hot job matches waiting for you'

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#fff7ed', fontFamily: 'system-ui, sans-serif' }}>
        <Container
          style={{
            maxWidth: '560px',
            margin: '40px auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #fed7aa',
            padding: '32px',
          }}
        >
          <Text style={{ fontSize: '12px', color: '#fb923c', margin: '0 0 12px', fontWeight: '600' }}>
            jobfishing · hot job alert
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
            🔥 {jobs.length} hot job match{jobs.length === 1 ? '' : 'es'} — act now
          </Heading>

          {jobs.map((job, index) => (
            <Section
              key={`${job.jobTitle}-${job.company}-${index}`}
              style={{
                backgroundColor: '#fff7ed',
                borderRadius: '6px',
                padding: '16px',
                margin: index === jobs.length - 1 ? 0 : '0 0 16px',
                border: '1px solid #fed7aa',
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

              <Hr style={{ borderColor: '#fed7aa', margin: '0 0 18px' }} />

              <Button
                href={job.applyUrl}
                style={{
                  backgroundColor: '#ea580c',
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
          ))}
        </Container>
      </Body>
    </Html>
  )
}
