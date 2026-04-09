import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import { createServiceClient } from '@/lib/supabase/service'
import { JobNotificationEmail } from '@/lib/email/job-notification'

interface NotifyUsersPayload {
  evaluationIds: string[]
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
}

export const notifyUsersTask = task({
  id: 'notify-users',
  retry: { maxAttempts: 2 },
  run: async ({ evaluationIds }: NotifyUsersPayload) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    const resend = new Resend(apiKey)
    const supabase = createServiceClient()

    // Fetch evaluations that are above threshold and not yet notified
    const { data: evaluations } = await supabase
      .from('job_evaluations')
      .select(`
        id,
        score,
        reasoning,
        dimensions,
        user_id,
        jobs (
          title,
          company,
          location,
          url,
          source
        )
      `)
      .in('id', evaluationIds)
      .is('notified_at', null)

    if (!evaluations?.length) {
      console.log('No evaluations to notify about')
      return
    }

    // Fetch profiles for qualifying users (two-query approach to avoid join type issues)
    const userIds = [...new Set(evaluations.map((e) => e.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, threshold, notifications_enabled')
      .in('id', userIds)

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

    // Filter to evaluations that exceed the user's threshold
    const qualifying = evaluations.filter((e) => {
      const profile = profileMap.get(e.user_id)
      return (
        profile?.notifications_enabled === true &&
        e.score >= (profile?.threshold ?? 7.0)
      )
    })

    console.log(`${qualifying.length} of ${evaluations.length} evaluations qualify for notification`)

    let notifiedCount = 0

    for (const evaluation of qualifying) {
      const job = Array.isArray(evaluation.jobs) ? evaluation.jobs[0] : evaluation.jobs
      if (!job) continue

      try {
        // Get user email from Supabase auth admin
        const { data: { user } } = await supabase.auth.admin.getUserById(evaluation.user_id)
        if (!user?.email) continue

        const emailHtml = await render(
          <JobNotificationEmail
            jobTitle={job.title}
            company={job.company}
            location={job.location ?? null}
            score={evaluation.score}
            reasoning={evaluation.reasoning ?? ''}
            dimensions={evaluation.dimensions as { role_fit: number; company_fit: number; location: number; growth_potential: number }}
            applyUrl={job.url}
            source={SOURCE_LABELS[job.source] ?? job.source}
          />
        )

        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
          to: user.email,
          subject: `${job.title} at ${job.company} — Score ${evaluation.score.toFixed(1)}/10`,
          html: emailHtml,
        })

        if (error) {
          Sentry.captureException(error, { extra: { evaluationId: evaluation.id } })
          continue
        }

        // Mark as notified only on successful send
        await supabase
          .from('job_evaluations')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', evaluation.id)

        notifiedCount++
      } catch (err) {
        Sentry.captureException(err, { extra: { evaluationId: evaluation.id } })
      }
    }

    console.log(`Sent ${notifiedCount} notifications`)
    return { notifiedCount }
  },
})
