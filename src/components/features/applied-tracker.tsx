import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionHeader } from './section-header'

export type AppliedBucket = 'awaiting' | 'heard' | 'ghosted'

export interface TrackerJob {
  job_id: string
  title: string
  company: string
  location?: string | null
  url: string
  applied_at: string | null
  bucket: AppliedBucket
  last_update?: string | null
}

interface AppliedTrackerProps {
  jobs: TrackerJob[]
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function BucketBadge({ bucket }: { bucket: AppliedBucket }) {
  if (bucket === 'awaiting') return <Badge variant="outline">Awaiting</Badge>
  if (bucket === 'heard') return <Badge variant="secondary" className="bg-green-50 text-green-700">Heard back</Badge>
  return <Badge variant="destructive">Ghosted</Badge>
}

function AppliedRow({ job }: { job: TrackerJob }) {
  const sublineParts = [job.company]
  if (job.applied_at) sublineParts.push(`Applied ${formatDate(job.applied_at)}`)
  if (job.last_update) sublineParts.push(job.last_update)

  return (
    <div className="flex items-center gap-4 border rounded-xl p-4 bg-card">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-[12px] font-semibold text-muted-foreground flex-shrink-0">
        {job.company.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold truncate">{job.title}</p>
        <p className="text-[13px] text-muted-foreground">{sublineParts.join(' · ')}</p>
      </div>
      <BucketBadge bucket={job.bucket} />
      <a href={job.url} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="h-8 flex-shrink-0">Open</Button>
      </a>
    </div>
  )
}

export function AppliedTracker({ jobs }: AppliedTrackerProps) {
  const awaiting = jobs.filter(j => j.bucket === 'awaiting')
  const heard = jobs.filter(j => j.bucket === 'heard')
  const ghosted = jobs.filter(j => j.bucket === 'ghosted')

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <p className="tabular-nums font-bold" style={{ fontSize: 26 }}>{awaiting.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Awaiting response</p>
        </Card>
        <Card className="p-4">
          <p className="tabular-nums font-bold text-green-600" style={{ fontSize: 26 }}>{heard.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Heard back</p>
        </Card>
        <Card className="p-4">
          <p className="tabular-nums font-bold text-red-600" style={{ fontSize: 26 }}>{ghosted.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Ghosted &gt;14d</p>
        </Card>
      </div>

      {awaiting.length > 0 && (
        <div>
          <SectionHeader title="Awaiting response" count={awaiting.length} dotColor="#a1a1aa" />
          <div className="flex flex-col gap-3 mt-4">
            {awaiting.map(job => <AppliedRow key={job.job_id} job={job} />)}
          </div>
        </div>
      )}

      {heard.length > 0 && (
        <div>
          <SectionHeader title="Heard back" count={heard.length} dotColor="#16a34a" />
          <div className="flex flex-col gap-3 mt-4">
            {heard.map(job => <AppliedRow key={job.job_id} job={job} />)}
          </div>
        </div>
      )}

      {ghosted.length > 0 && (
        <div>
          <SectionHeader title="Ghosted &gt;14d" count={ghosted.length} dotColor="#dc2626" />
          <div className="flex flex-col gap-3 mt-4">
            {ghosted.map(job => <AppliedRow key={job.job_id} job={job} />)}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No applications yet</p>
      )}
    </div>
  )
}
