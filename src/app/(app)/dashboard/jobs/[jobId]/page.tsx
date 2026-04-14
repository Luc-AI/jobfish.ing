import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJobDetail } from '@/lib/supabase/queries'
import { JobDetailHeader } from '@/components/features/job-detail-header'
import { JobDetailScoring } from '@/components/features/job-detail-scoring'
import { JobDetailContent } from '@/components/features/job-detail-content'
import { Separator } from '@/components/ui/separator'
import { upsertJobActionFromDetail } from './actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface JobDetailPageProps {
  params: Promise<{ jobId: string }>
}

export async function generateMetadata({ params }: JobDetailPageProps) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const detail = await getJobDetail(user.id, jobId)
  if (!detail) return { title: 'Job — Jobfish' }

  return {
    title: `${detail.job.title} at ${detail.job.company} — Jobfish`,
  }
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { jobId } = await params
  const detail = await getJobDetail(user.id, jobId)

  if (!detail) notFound()

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feed
      </Link>

      <JobDetailHeader
        job={detail.job}
        score={detail.evaluation?.score ?? null}
        action={detail.action}
        onAction={upsertJobActionFromDetail}
      />

      <Separator />

      {detail.evaluation && (
        <>
          <JobDetailScoring evaluation={detail.evaluation} />
          <Separator />
        </>
      )}

      <JobDetailContent job={detail.job} />
    </div>
  )
}
