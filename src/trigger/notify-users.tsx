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

/*
 * Current delivery model:
 * - Each qualifying job evaluation is delivered as its own email.
 * - The task loops evaluation-by-evaluation, renders a single job notification,
 *   and marks that evaluation as notified after a successful send.
 *
 * Digest refactor note:
 * - The next iteration will likely group multiple qualifying evaluations into a
 *   single digest per user instead of one message per evaluation.
 * - Existing behavior should remain one email per qualifying evaluation until
 *   the digest refactor changes the delivery unit on purpose.
 */
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

    // Fetch candidate evaluations that are not yet notified
    const { data: evaluations, error: evaluationsError } = await supabase
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

    if (evaluationsError) {
      throw evaluationsError
    }

    if (!evaluations?.length) {
      console.log('No evaluations to notify about')
      return { notifiedCount: 0 }
    }

    // Fetch profiles for qualifying users (two-query approach to avoid join type issues)
    const userIds = [...new Set(evaluations.map((e) => e.user_id))]
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, threshold, notifications_enabled')
      .in('id', userIds)

    if (profilesError) {
      throw profilesError
    }

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

        // Mark as notified only on successful send and persistence update.
        const { error: updateError } = await supabase
          .from('job_evaluations')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', evaluation.id)

        if (updateError) {
          Sentry.captureException(updateError, { extra: { evaluationId: evaluation.id } })
          continue
        }

        notifiedCount++
      } catch (err) {
        Sentry.captureException(err, { extra: { evaluationId: evaluation.id } })
      }
    }

    console.log(`Sent ${notifiedCount} notifications`)
    return { notifiedCount }
  },
})
