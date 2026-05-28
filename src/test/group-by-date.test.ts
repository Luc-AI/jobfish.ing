import { describe, it, expect } from 'vitest'
import { groupByDateBucket, type DateBucket } from '@/lib/feed/group-by-date'

function makeItem(id: string, datePosted: string | null, createdAt: string): {
  id: string
  jobs: { date_posted: string | null }
  created_at: string
} {
  return { id, jobs: { date_posted: datePosted }, created_at: createdAt }
}

describe('groupByDateBucket', () => {
  const now = new Date('2026-05-28T12:00:00.000Z')

  it('buckets a job posted today into "today"', () => {
    const item = makeItem('a', '2026-05-28', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result).toEqual([{ bucket: 'today', items: [item] }])
  })

  it('buckets a job posted yesterday into "yesterday"', () => {
    const item = makeItem('b', '2026-05-27', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('yesterday')
  })

  it('buckets a job 3 days old into "last_7_days"', () => {
    const item = makeItem('c', '2026-05-25', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('last_7_days')
  })

  it('buckets a job 10 days old into "older"', () => {
    const item = makeItem('d', '2026-05-18', now.toISOString())
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('older')
  })

  it('falls back to created_at when date_posted is null', () => {
    const item = makeItem('e', null, '2026-05-28T08:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('today')
  })

  it('preserves input order within each bucket', () => {
    const a = makeItem('a', '2026-05-28', now.toISOString())
    const b = makeItem('b', '2026-05-28', now.toISOString())
    const result = groupByDateBucket([a, b], now)
    expect(result[0].items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('emits buckets in order today → yesterday → last_7_days → older, skipping empty', () => {
    const today = makeItem('t', '2026-05-28', now.toISOString())
    const older = makeItem('o', '2026-05-01', now.toISOString())
    const result = groupByDateBucket([older, today], now)
    expect(result.map(g => g.bucket)).toEqual(['today', 'older'])
  })

  it('returns empty array for empty input', () => {
    expect(groupByDateBucket([], now)).toEqual([])
  })
})
