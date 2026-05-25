'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface DismissedJob {
  job_id: string
  title: string
  company: string
  location: string | null
  remoteType: string | null
  url: string
}

interface DismissedListProps {
  jobs: DismissedJob[]
  onRestore: (jobId: string) => void
}

export function DismissedList({ jobs: initialJobs, onRestore }: DismissedListProps) {
  const [jobs, setJobs] = useState<DismissedJob[]>(initialJobs)

  function handleRestore(jobId: string) {
    setJobs((prev: DismissedJob[]) => prev.filter((j: DismissedJob) => j.job_id !== jobId))
    onRestore(jobId)
  }

  if (jobs.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">No dismissed jobs</p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job: DismissedJob) => {
        const sublineParts = [job.company]
        if (job.location) sublineParts.push(job.location)
        if (job.remoteType) sublineParts.push(job.remoteType)

        return (
          <div key={job.job_id} className="flex items-center gap-4 border rounded-xl p-4 bg-card">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-[13px] font-semibold text-muted-foreground flex-shrink-0">
              {job.company.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold truncate">{job.title}</p>
              <p className="text-[13.5px] text-muted-foreground">{sublineParts.join(' · ')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-shrink-0"
              onClick={() => handleRestore(job.job_id)}
            >
              Restore
            </Button>
          </div>
        )
      })}
    </div>
  )
}
