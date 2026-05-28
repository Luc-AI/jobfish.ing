export const SCORE_FILTERS = ['hot', 'threshold', 'eight', 'seven', 'all'] as const
export type ScoreFilter = typeof SCORE_FILTERS[number]

export const TIME_FILTERS = ['7d', 'all'] as const
export type TimeFilter = typeof TIME_FILTERS[number]

export function parseScoreFilter(raw: string | undefined): ScoreFilter {
  if (raw && (SCORE_FILTERS as readonly string[]).includes(raw)) {
    return raw as ScoreFilter
  }
  return 'threshold'
}

export function parseTimeFilter(raw: string | undefined): TimeFilter {
  if (raw && (TIME_FILTERS as readonly string[]).includes(raw)) {
    return raw as TimeFilter
  }
  return '7d'
}

export function scoreFilterToFloor(filter: ScoreFilter, userThreshold: number): number {
  switch (filter) {
    case 'hot': return 9
    case 'threshold': return userThreshold
    case 'eight': return 8
    case 'seven': return 7
    case 'all': return 0
  }
}
