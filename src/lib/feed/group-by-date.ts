export type DateBucket = 'today' | 'yesterday' | 'last_7_days' | 'older'

type GroupableItem = {
  jobs: { synced_at: string }
}

const BUCKET_ORDER: DateBucket[] = ['today', 'yesterday', 'last_7_days', 'older']

function bucketFor(itemDate: Date, now: Date): DateBucket {
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.floor((startOfDay(now) - startOfDay(itemDate)) / 86_400_000)

  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays <= 7) return 'last_7_days'
  return 'older'
}

export function groupByDateBucket<T extends GroupableItem>(
  items: T[],
  now: Date = new Date()
): Array<{ bucket: DateBucket; items: T[] }> {
  const byBucket = new Map<DateBucket, T[]>()
  for (const item of items) {
    const b = bucketFor(new Date(item.jobs.synced_at), now)
    const list = byBucket.get(b) ?? []
    list.push(item)
    byBucket.set(b, list)
  }
  return BUCKET_ORDER
    .filter(b => byBucket.has(b))
    .map(b => ({ bucket: b, items: byBucket.get(b)! }))
}
