'use client'

import { useState } from 'react'
import { MapPin, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from './score-badge'
import { cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'

interface Dimensions {
  role_fit: number
  domain_fit: number
  experience_fit: number
  location_fit: number
  upside: number
}

export interface JobEvaluation {
  id: string
  score: number
  reasoning: string | null
  dimensions: Dimensions | null
  notified_at: string | null
  created_at: string
  jobs: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    scraped_at: string
  } | null
  user_job_actions?: {
    status: 'saved' | 'hidden' | 'applied'
    applied_at: string | null
  } | null
}

interface JobCardProps {
  evaluation: JobEvaluation
  onAction: (jobId: string, action: 'saved' | 'hidden' | 'applied') => void
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
}

export function JobCard({ evaluation, onAction }: JobCardProps) {
  const [expanded, setExpanded] = useState(false)
  const job = evaluation.jobs
  if (!job) return null

  const currentStatus = evaluation.user_job_actions?.status

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">{job.title}</h3>
              {currentStatus === 'applied' && (
                <Badge variant="outline" className="text-xs text-green-700 border-green-200">Applied</Badge>
              )}
              {currentStatus === 'saved' && (
                <Badge variant="outline" className="text-xs">Saved</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">{job.company}</span>
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
              <span className="text-xs">{SOURCE_LABELS[job.source] ?? job.source}</span>
            </div>
          </div>
          <ScoreBadge score={evaluation.score} className="shrink-0" />
        </div>

        {evaluation.dimensions && (
          <div className="grid grid-cols-5 gap-2 mt-4">
            {Object.entries(evaluation.dimensions).map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-xs text-muted-foreground capitalize">
                  {key.replace('_', ' ')}
                </p>
                <p className="text-sm font-semibold tabular-nums">{val.toFixed(1)}</p>
              </div>
            ))}
          </div>
        )}

        {evaluation.reasoning && (
          <div className="mt-3">
            <button
              onClick={() => {
                setExpanded(!expanded)
                if (!expanded) posthog.capture('job_viewed', { job_id: job.id, score: evaluation.score })
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Why this job"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Why this job
            </button>
            {expanded && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed italic">
                &ldquo;{evaluation.reasoning}&rdquo;
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              posthog.capture('job_saved', { job_id: job.id, score: evaluation.score })
              onAction(job.id, 'saved')
            }}
            className={cn(currentStatus === 'saved' && 'border-primary')}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              posthog.capture('job_hidden', { job_id: job.id, score: evaluation.score })
              onAction(job.id, 'hidden')
            }}
          >
            Hide
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            asChild
            onClick={() => {
              posthog.capture('job_applied', { job_id: job.id, score: evaluation.score })
              onAction(job.id, 'applied')
            }}
          >
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              Apply <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
