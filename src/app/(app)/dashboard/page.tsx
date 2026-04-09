import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed } from '@/lib/supabase/queries'
import { JobFeed } from '@/components/features/job-feed'
import { upsertJobAction } from './actions'
import type { JobEvaluation } from '@/components/features/job-card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface DashboardPageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))
  const pageSize = 20

  const { data: evaluations } = await getJobFeed(user.id, page, pageSize)

  const hasMore = (evaluations?.length ?? 0) === pageSize

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your feed</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Jobs sorted by how well they match your profile.
          </p>
        </div>
      </div>

      <JobFeed
        evaluations={(evaluations ?? []) as JobEvaluation[]}
        onAction={upsertJobAction}
      />

      {(page > 1 || hasMore) && (
        <div className="flex justify-between mt-6">
          {page > 1 ? (
            <Button variant="outline" asChild>
              <Link href={`/dashboard?page=${page - 1}`}>← Previous</Link>
            </Button>
          ) : <div />}
          {hasMore && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard?page=${page + 1}`}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
