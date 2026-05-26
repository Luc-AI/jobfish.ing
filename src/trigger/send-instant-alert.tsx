import { render } from '@react-email/components'
import * as Sentry from '@sentry/node'
import { task } from '@trigger.dev/sdk'
import { Resend } from 'resend'
import { JobAlertEmail, getAlertSubject, type AlertJobItem } from '@/lib/email/job-alert'
import { createServiceClient } from '@/lib/supabase/service'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  'jobs.ch': 'jobs.ch',
}

function formatSource(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source
}

interface EvaluationJobRow {
  title: string
  company: string
  location: string | null
  url: string
  source: string
}

interface EvaluationRow {
  id: string
  score: number
  reasoning: string | null
  instant_alerted_at: string | null
  jobs: EvaluationJobRow | EvaluationJobRow[] | null
}

function getEvaluationJob(jobs: EvaluationRow['jobs']): EvaluationJobRow | null {
  if (Array.isArray(jobs)) {
    return jobs[0] ?? null
  }

  return jobs ?? null
}

export const sendInstantAlertTask = task({
  id: 'send-instant-alert',
  retry: { maxAttempts: 2 },
  run: async (payload: { userId: string; evaluationIds: string[] }) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    const resend = new Resend(apiKey)
    const supabase = createServiceClient()

    const { data: evaluations, error: evaluationsError } = await supabase
      .from('job_evaluations')
      .select(`
        id,
        score,
        reasoning,
        instant_alerted_at,
        jobs (
          title,
          company,
          location,
          url,
          source
        )
      `)
      .in('id', payload.evaluationIds)

    if (evaluationsError) {
      throw evaluationsError
    }

    if (!evaluations?.length) {
      console.log('No evaluations found for instant alert')
      return { sentCount: 0 }
    }

    // Idempotency guard: skip already-alerted evaluations
    const qualifying = (evaluations as EvaluationRow[]).filter(
      evaluation => evaluation.instant_alerted_at === null
    )

    if (qualifying.length === 0) {
      console.log('All evaluations already alerted — skipping')
      return { sentCount: 0 }
    }

    const qualifyingIds = qualifying.map(evaluation => evaluation.id)

    // Fetch user email
    const authLookup = await supabase.auth.admin.getUserById(payload.userId)
    const authError = 'error' in authLookup ? authLookup.error : null
    const user = authLookup.data?.user

    if (authError) {
      Sentry.captureException(authError, { extra: { userId: payload.userId } })
      return { sentCount: 0 }
    }

    if (!user?.email) {
      Sentry.captureException(
        new Error('Missing email for instant alert recipient'),
        { extra: { userId: payload.userId } }
      )
      return { sentCount: 0 }
    }

    // Build sorted alert job items
    const alertJobs: AlertJobItem[] = qualifying
      .map(evaluation => {
        const job = getEvaluationJob(evaluation.jobs)
        if (!job) return null

        return {
          jobTitle: job.title,
          company: job.company,
          location: job.location ?? null,
          score: evaluation.score,
          reasoning: evaluation.reasoning ?? '',
          applyUrl: job.url,
          source: formatSource(job.source),
        } satisfies AlertJobItem
      })
      .filter((item): item is AlertJobItem => item !== null)
      .sort((a, b) => b.score - a.score)

    if (alertJobs.length === 0) {
      console.log('No valid jobs found in qualifying evaluations — skipping')
      return { sentCount: 0 }
    }

    const html = await render(<JobAlertEmail jobs={alertJobs} />)

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
      to: user.email,
      subject: getAlertSubject(alertJobs.length),
      html,
    })

    if (sendError) {
      Sentry.captureException(sendError, { extra: { userId: payload.userId } })
      return { sentCount: 0 }
    }

    // Stamp instant_alerted_at only after successful send
    const { error: updateError } = await supabase
      .from('job_evaluations')
      .update({ instant_alerted_at: new Date().toISOString() })
      .in('id', qualifyingIds)

    if (updateError) {
      Sentry.captureException(updateError, {
        extra: { userId: payload.userId, evaluationIds: qualifyingIds },
      })
      throw updateError
    }

    console.log(`Sent instant alert for user ${payload.userId} covering ${alertJobs.length} jobs`)
    return { sentCount: 1, jobCount: alertJobs.length }
  },
})
