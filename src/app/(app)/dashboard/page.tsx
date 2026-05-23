import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed, type FeedSort } from '@/lib/supabase/queries'
import { JobFeed } from '@/components/features/job-feed'
import { upsertJobAction } from './actions'
import type { JobEvaluation } from '@/components/features/job-card'
import { Button } from '@/components/ui/button'

const SORT_LABELS: Record<FeedSort, string> = {
  fresh:    'Freshest first',
  best:     'Best matches',
  balanced: 'Balanced mix',
  archived: 'Archived',
}

const SORT_COPY: Record<FeedSort, string> = {
  fresh:    'Newest listings first — score still filters the noise.',
  best:     'A strong fit from last week still outranks a weaker one posted today.',
  balanced: 'Fit and freshness, both in the mix.',
  archived: 'Jobs posted more than 30 days ago, oldest finds last.',
}

const SORT_ORDER: FeedSort[] = ['fresh', 'best', 'balanced', 'archived']

interface DashboardPageProps {
  searchParams: Promise<{ page?: string; sort?: string }>
}

function isValidSort(s: string | undefined): s is FeedSort {
  return s === 'fresh' || s === 'best' || s === 'balanced' || s === 'archived'
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))
  const sort: FeedSort = isValidSort(params.sort) ? params.sort : 'fresh'
  const pageSize = 20

  const { data: evaluations, error: feedError } = await getJobFeed(user.id, page, pageSize, true, sort)
  if (feedError) console.error('[dashboard] getJobFeed error:', feedError)

  const hasMore = (evaluations?.length ?? 0) === pageSize

  function sortHref(s: FeedSort) {
    return s === 'fresh' ? '/dashboard' : `/dashboard?sort=${s}`
  }

  function pageHref(p: number) {
    const base = sort === 'fresh' ? '/dashboard' : `/dashboard?sort=${sort}`
    return p === 1 ? base : `${base}${sort === 'fresh' ? '?' : '&'}page=${p}`
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Your feed</h1>
        <div className="flex gap-1">
          {SORT_ORDER.map(s => (
            <Button
              key={s}
              variant={sort === s ? 'default' : 'ghost'}
              size="sm"
              asChild
            >
              <Link href={sortHref(s)}>{SORT_LABELS[s]}</Link>
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{SORT_COPY[sort]}</p>

      <JobFeed
        evaluations={(evaluations ?? []) as JobEvaluation[]}
        onAction={upsertJobAction}
      />

      {(page > 1 || hasMore) && (
        <div className="flex justify-between mt-6">
          {page > 1 ? (
            <Button variant="outline" asChild>
              <Link href={pageHref(page - 1)}>← Previous</Link>
            </Button>
          ) : <div />}
          {hasMore && (
            <Button variant="outline" asChild>
              <Link href={pageHref(page + 1)}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
