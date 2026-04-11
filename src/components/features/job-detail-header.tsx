'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from './score-badge'
import { MapPin, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobDetailData } from '@/lib/supabase/queries'

interface JobDetailHeaderProps {
  job: JobDetailData['job']
  score: number | null
  action: JobDetailData['action']
  onAction: (jobId: string, status: 'saved' | 'hidden' | 'applied') => Promise<void>
}

export function JobDetailHeader({ job, score, action, onAction }: JobDetailHeaderProps) {
  const [isPending, startTransition] = useTransition()
  const currentStatus = action?.status

  function handleAction(status: 'saved' | 'hidden' | 'applied') {
    startTransition(() => {
      onAction(job.id, status)
    })
  }

  const chips: { label: string; value: string }[] = [
    job.work_arrangement ? { label: 'arrangement', value: job.work_arrangement } : null,
    ...(job.employment_type ?? []).map(t => ({ label: 'type', value: t })),
    job.experience_level ? { label: 'level', value: job.experience_level } : null,
    job.job_language ? { label: 'language', value: job.job_language } : null,
    job.working_hours != null ? { label: 'hours', value: `${job.working_hours}h/week` } : null,
  ].filter((c): c is { label: string; value: string } => c !== null)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">{job.company}</span>
            {(job.detail_facts?.location_display ?? job.location) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.detail_facts?.location_display ?? job.location}
              </span>
            )}
          </div>
        </div>
        {score != null && <ScoreBadge score={score} className="text-2xl px-3 py-1 shrink-0" />}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => (
            <Badge key={`${chip.label}-${chip.value}`} variant="secondary" className="capitalize">
              {chip.value}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => handleAction('saved')}
          className={cn(currentStatus === 'saved' && 'border-primary')}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => handleAction('hidden')}
        >
          Hide
        </Button>
        <div className="flex-1" />
        <Button size="sm" asChild disabled={isPending} onClick={() => handleAction('applied')}>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Apply <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      </div>
    </div>
  )
}
