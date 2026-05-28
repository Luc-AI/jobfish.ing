import Link from 'next/link'
import { searchUserJobs, type FeedItem } from '@/lib/supabase/queries'
import { JobLogRow } from './job-log-row'

interface SearchResultsProps {
  userId: string
  query: string
}

export async function SearchResults({ userId, query }: SearchResultsProps) {
  const trimmed = query.trim()

  if (trimmed.length < 2) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        Keep typing — at least 2 characters.
      </p>
    )
  }

  const { results, totalMatches } = await searchUserJobs(userId, trimmed)

  if (results.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        No matches for &ldquo;{trimmed}&rdquo;. Try fewer words or different terms.
      </p>
    )
  }

  const truncated = totalMatches > results.length

  return (
    <div className="space-y-3">
      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing {results.length} of {totalMatches} — refine your search to narrow results.
        </p>
      )}
      {results.map((item: FeedItem) => {
        const status = (item.user_job_actions?.status ?? 'new') as
          | 'new'
          | 'saved'
          | 'applied'
          | 'dismissed'
        return (
          <Link
            key={item.id}
            href={`/dashboard/jobs/${item.job_id}`}
            className="block"
          >
            <JobLogRow
              id={item.id}
              jobId={item.job_id}
              title={item.jobs.title}
              company={item.jobs.company}
              location={item.jobs.location}
              url={item.jobs.url}
              remoteType={item.jobs.remote_type}
              score={item.score}
              chips={item.chips}
              isUnread={false}
              syncedAt={item.jobs.synced_at}
              status={status}
              appliedAt={item.user_job_actions?.applied_at}
            />
          </Link>
        )
      })}
    </div>
  )
}
