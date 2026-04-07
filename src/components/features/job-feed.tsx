'use client'

import { JobCard } from './job-card'
import { upsertJobActionClient } from '@/app/(app)/dashboard/actions'

type Evaluation = Parameters<typeof JobCard>[0]['evaluation']

interface JobFeedProps {
  evaluations: Evaluation[]
  onAction: (jobId: string, action: 'saved' | 'hidden' | 'applied') => void
}

export function JobFeed({ evaluations, onAction }: JobFeedProps) {
  if (evaluations.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No jobs yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          The pipeline runs every 6 hours — check back soon.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {evaluations.map(evaluation => (
        <JobCard
          key={evaluation.id}
          evaluation={evaluation}
          onAction={onAction}
        />
      ))}
    </div>
  )
}
