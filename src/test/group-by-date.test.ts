import { describe, it, expect } from 'vitest'
import { groupByDateBucket } from '@/lib/feed/group-by-date'

function makeItem(id: string, syncedAt: string): {
  id: string
  jobs: { synced_at: string }
} {
  return { id, jobs: { synced_at: syncedAt } }
}

describe('groupByDateBucket', () => {
  const now = new Date('2026-05-28T12:00:00.000Z')

  it('buckets a job synced today into "today"', () => {
    const item = makeItem('a', '2026-05-28T09:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result).toEqual([{ bucket: 'today', items: [item] }])
  })

  it('buckets a job synced yesterday into "yesterday"', () => {
    const item = makeItem('b', '2026-05-27T09:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('yesterday')
  })

  it('buckets a job synced 3 days ago into "last_7_days"', () => {
    const item = makeItem('c', '2026-05-25T09:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('last_7_days')
  })

  it('buckets a job synced 10 days ago into "older"', () => {
    const item = makeItem('d', '2026-05-18T09:00:00.000Z')
    const result = groupByDateBucket([item], now)
    expect(result[0].bucket).toBe('older')
  })

  it('preserves input order within each bucket', () => {
    const a = makeItem('a', '2026-05-28T09:00:00.000Z')
    const b = makeItem('b', '2026-05-28T10:00:00.000Z')
    const result = groupByDateBucket([a, b], now)
    expect(result[0].items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('emits buckets in order today → yesterday → last_7_days → older, skipping empty', () => {
    const today = makeItem('t', '2026-05-28T09:00:00.000Z')
    const older = makeItem('o', '2026-05-01T09:00:00.000Z')
    const result = groupByDateBucket([older, today], now)
    expect(result.map(g => g.bucket)).toEqual(['today', 'older'])
  })

  it('returns empty array for empty input', () => {
    expect(groupByDateBucket([], now)).toEqual([])
  })
})
