import { describe, it, expect } from 'vitest'
import {
  parseScoreFilter,
  parseTimeFilter,
  scoreFilterToFloor,
  SCORE_FILTERS,
  TIME_FILTERS,
  type ScoreFilter,
  type TimeFilter,
} from '@/lib/feed/filters'

describe('parseScoreFilter', () => {
  it('returns "threshold" by default when param is missing', () => {
    expect(parseScoreFilter(undefined)).toBe('threshold')
  })

  it('returns "threshold" for unknown values', () => {
    expect(parseScoreFilter('garbage')).toBe('threshold')
  })

  it('accepts known filter values', () => {
    expect(parseScoreFilter('hot')).toBe('hot')
    expect(parseScoreFilter('threshold')).toBe('threshold')
    expect(parseScoreFilter('eight')).toBe('eight')
    expect(parseScoreFilter('seven')).toBe('seven')
    expect(parseScoreFilter('all')).toBe('all')
  })
})

describe('parseTimeFilter', () => {
  it('returns "7d" by default when param is missing', () => {
    expect(parseTimeFilter(undefined)).toBe('7d')
  })

  it('returns "7d" for unknown values', () => {
    expect(parseTimeFilter('garbage')).toBe('7d')
  })

  it('accepts "all"', () => {
    expect(parseTimeFilter('all')).toBe('all')
  })
})

describe('scoreFilterToFloor', () => {
  const userThreshold = 7.0

  it('hot → 9', () => {
    expect(scoreFilterToFloor('hot', userThreshold)).toBe(9)
  })

  it('threshold → user threshold value', () => {
    expect(scoreFilterToFloor('threshold', 7.5)).toBe(7.5)
  })

  it('eight → 8, seven → 7', () => {
    expect(scoreFilterToFloor('eight', userThreshold)).toBe(8)
    expect(scoreFilterToFloor('seven', userThreshold)).toBe(7)
  })

  it('all → 0 (no floor)', () => {
    expect(scoreFilterToFloor('all', userThreshold)).toBe(0)
  })
})

describe('SCORE_FILTERS / TIME_FILTERS', () => {
  it('SCORE_FILTERS is exhaustive', () => {
    expect(SCORE_FILTERS).toEqual(['hot', 'threshold', 'eight', 'seven', 'all'])
  })

  it('TIME_FILTERS is exhaustive', () => {
    expect(TIME_FILTERS).toEqual(['7d', 'all'])
  })
})
