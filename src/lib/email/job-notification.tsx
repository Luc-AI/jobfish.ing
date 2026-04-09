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

interface Dimensions {
  role_fit: number
  company_fit: number
  location: number
  growth_potential: number
}

interface JobNotificationEmailProps {
  jobTitle: string
  company: string
  location: string | null
  score: number
  reasoning: string
  dimensions: Dimensions
  applyUrl: string
  source: string
}

function scoreColor(score: number): string {
  if (score >= 8) return '#15803d'
  if (score >= 6) return '#a16207'
  return '#b91c1c'
}

export function JobNotificationEmail({
  jobTitle,
  company,
  location,
  score,
  reasoning,
  dimensions,
  applyUrl,
  source,
}: JobNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {jobTitle} at {company} — Score {score.toFixed(1)}/10
      </Preview>
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
          <Text style={{ fontSize: '12px', color: '#a8a29e', margin: '0 0 16px' }}>
            jobfishing · jobs find you
          </Text>

          <Heading
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#1c1917',
              margin: '0 0 4px',
              letterSpacing: '-0.02em',
            }}
          >
            {jobTitle}
          </Heading>

          <Text style={{ fontSize: '15px', color: '#57534e', margin: '0 0 20px' }}>
            {company}
            {location ? ` · ${location}` : ''}
            {' · '}
            <span style={{ color: '#a8a29e', fontSize: '13px' }}>{source}</span>
          </Text>

          <Section
            style={{
              backgroundColor: '#fafaf9',
              borderRadius: '6px',
              padding: '16px',
              margin: '0 0 20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <Text style={{ margin: 0, fontSize: '13px', color: '#78716c', fontWeight: '600' }}>
                Match score
              </Text>
              <Text
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: '800',
                  color: scoreColor(score),
                  letterSpacing: '-0.03em',
                }}
              >
                {score.toFixed(1)}
              </Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {Object.entries(dimensions).map(([key, val]) => (
                <div key={key}>
                  <Text style={{ margin: 0, fontSize: '11px', color: '#a8a29e', textTransform: 'capitalize' }}>
                    {key.replace('_', ' ')}
                  </Text>
                  <Text style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: '600', color: '#1c1917' }}>
                    {val.toFixed(1)}
                  </Text>
                </div>
              ))}
            </div>
          </Section>

          <Text
            style={{
              fontSize: '14px',
              color: '#57534e',
              fontStyle: 'italic',
              lineHeight: '1.6',
              margin: '0 0 24px',
            }}
          >
            &ldquo;{reasoning}&rdquo;
          </Text>

          <Hr style={{ borderColor: '#e7e5e4', margin: '0 0 24px' }} />

          <Button
            href={applyUrl}
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
        </Container>
      </Body>
    </Html>
  )
}
