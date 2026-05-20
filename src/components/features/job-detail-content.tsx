import { ExternalLink } from 'lucide-react'
import type { JobDetailData } from '@/lib/supabase/queries'

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  'jobs.ch': 'Jobs.ch',
  company_site: 'Company',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  workday: 'Workday',
}

interface JobDetailContentProps {
  job: JobDetailData['job']
}

export function JobDetailContent({ job }: JobDetailContentProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Job Description</h2>

      {job.description && (
        <div>
          <p className="text-sm font-medium mb-2">Full Description</p>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {job.description}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
        <span>Source: {SOURCE_LABELS[job.source] ?? job.source}</span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          View original <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}
