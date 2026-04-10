import { render } from '@react-email/components'
import * as Sentry from '@sentry/node'
import { schedules } from '@trigger.dev/sdk'
import { Resend } from 'resend'
import { JobDigestEmail, type DigestJobItem } from '@/lib/email/job-digest'
import { createServiceClient } from '@/lib/supabase/service'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
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
  user_id: string
  created_at?: string
  jobs: EvaluationJobRow | EvaluationJobRow[] | null
}

interface ProfileRow {
  id: string
  threshold: number | null
  notifications_enabled: boolean | null
}

interface UserDigest {
  userId: string
  evaluationIds: string[]
  jobs: DigestJobItem[]
}

function compareNullableStrings(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '')
}

function sortEvaluations(evaluations: EvaluationRow[]): EvaluationRow[] {
  return [...evaluations].sort((left, right) => {
    return (
      compareNullableStrings(left.user_id, right.user_id) ||
      compareNullableStrings(left.created_at, right.created_at) ||
      compareNullableStrings(left.id, right.id)
    )
  })
}

function getDigestSubject(jobCount: number): string {
  return `${jobCount} new job match${jobCount === 1 ? '' : 'es'} for you`
}

function getEvaluationJob(jobs: EvaluationRow['jobs']): EvaluationJobRow | null {
  if (Array.isArray(jobs)) {
    return jobs[0] ?? null
  }

  return jobs ?? null
}

export function buildUserDigests(
  evaluations: EvaluationRow[],
  profiles: ProfileRow[]
): UserDigest[] {
  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const digestsByUser = new Map<string, UserDigest>()

  for (const evaluation of sortEvaluations(evaluations)) {
    const profile = profileById.get(evaluation.user_id)
    const threshold = profile?.threshold ?? 7

    if (profile?.notifications_enabled !== true || evaluation.score < threshold) {
      continue
    }

    const job = getEvaluationJob(evaluation.jobs)
    if (!job) {
      continue
    }

    const existingDigest = digestsByUser.get(evaluation.user_id)
    const digestJob: DigestJobItem = {
      jobTitle: job.title,
      company: job.company,
      location: job.location ?? null,
      score: evaluation.score,
      reasoning: evaluation.reasoning ?? '',
      applyUrl: job.url,
      source: SOURCE_LABELS[job.source] ?? job.source,
    }

    if (existingDigest) {
      existingDigest.evaluationIds.push(evaluation.id)
      existingDigest.jobs.push(digestJob)
      continue
    }

    digestsByUser.set(evaluation.user_id, {
      userId: evaluation.user_id,
      evaluationIds: [evaluation.id],
      jobs: [digestJob],
    })
  }

  return [...digestsByUser.values()].sort((left, right) => {
    return compareNullableStrings(left.userId, right.userId)
  })
}

export const notifyUsersTask = schedules.task({
  id: 'notify-users',
  cron: {
    pattern: '0 8 * * *',
    timezone: 'Europe/Zurich',
  },
  retry: { maxAttempts: 1 },
  run: async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }

    const resend = new Resend(apiKey)
    const supabase = createServiceClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: evaluations, error: evaluationsError } = await supabase
      .from('job_evaluations')
      .select(`
        id,
        score,
        reasoning,
        user_id,
        created_at,
        jobs (
          title,
          company,
          location,
          url,
          source
        )
      `)
      .is('notified_at', null)
      .gte('created_at', since)

    if (evaluationsError) {
      throw evaluationsError
    }

    if (!evaluations?.length) {
      console.log('No evaluations to include in today\'s digest')
      return { notifiedCount: 0, evaluationCount: 0 }
    }

    const sortedEvaluations = sortEvaluations(evaluations as EvaluationRow[])

    const userIds = [...new Set(sortedEvaluations.map(evaluation => evaluation.user_id))]
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, threshold, notifications_enabled')
      .in('id', userIds)

    if (profilesError) {
      throw profilesError
    }

    const digests = buildUserDigests(
      sortedEvaluations,
      (profiles ?? []) as ProfileRow[]
    )

    if (digests.length === 0) {
      console.log('No qualifying evaluations to notify about')
      return { notifiedCount: 0, evaluationCount: 0 }
    }

    let notifiedCount = 0
    let evaluationCount = 0

    for (const digest of digests) {
      try {
        const authLookup = await supabase.auth.admin.getUserById(digest.userId)
        const authError = 'error' in authLookup ? authLookup.error : null
        const user = authLookup.data?.user

        if (authError) {
          Sentry.captureException(authError, { extra: { userId: digest.userId } })
          throw authError
        }

        if (!user?.email) {
          const missingEmailError = new Error('Missing email for digest recipient')
          Sentry.captureException(missingEmailError, { extra: { userId: digest.userId } })
          throw missingEmailError
        }

        const html = await render(<JobDigestEmail jobs={digest.jobs} />)

        const { error: sendError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
          to: user.email,
          subject: getDigestSubject(digest.jobs.length),
          html,
        })

        if (sendError) {
          Sentry.captureException(sendError, { extra: { userId: digest.userId } })
          continue
        }
      } catch (error) {
        throw error
      }

      const { error: updateError } = await supabase
        .from('job_evaluations')
        .update({ notified_at: new Date().toISOString() })
        .in('id', digest.evaluationIds)

      if (updateError) {
        Sentry.captureException(updateError, {
          extra: { userId: digest.userId, evaluationIds: digest.evaluationIds },
        })
        throw updateError
      }

      notifiedCount++
      evaluationCount += digest.evaluationIds.length
    }

    console.log(`Sent ${notifiedCount} digests covering ${evaluationCount} evaluations`)
    return { notifiedCount, evaluationCount }
  },
})
