import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobDetailScoring } from '@/components/features/job-detail-scoring'
import type { JobDetailData } from '@/lib/supabase/queries'

type Evaluation = NonNullable<JobDetailData['evaluation']>

const fullEvaluation: Evaluation = {
  id: 'eval-1',
  score: 8.5,
  reasoning: 'Great overall match.',
  dimensions: {
    role_fit: 9,
    domain_fit: 8,
    experience_fit: 9,
    location_fit: 7,
    upside: 8,
  },
  detailed_reasoning: {
    summary: 'Strong overall fit for your product background.',
    strengths: ['Clear overlap with product ownership'],
    concerns: ['Domain ramp-up required'],
    red_flags: ['Unrealistic equity promise'],
    recommendation: 'Worth a serious look.',
    dimension_explanations: {
      role_fit: 'Scope matches well.',
      domain_fit: 'Ramp-up needed.',
      experience_fit: 'Seniority aligned.',
      location_fit: 'Acceptable.',
      upside: 'Good growth.',
    },
  },
}

describe('JobDetailScoring', () => {
  it('renders the total score', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('renders all five dimension labels', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText(/role fit/i)).toBeInTheDocument()
    expect(screen.getByText(/domain fit/i)).toBeInTheDocument()
    expect(screen.getByText(/experience fit/i)).toBeInTheDocument()
    expect(screen.getByText(/location fit/i)).toBeInTheDocument()
    expect(screen.getByText(/upside/i)).toBeInTheDocument()
  })

  it('renders the summary from detailed_reasoning', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Strong overall fit for your product background.')).toBeInTheDocument()
  })

  it('renders strengths', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Clear overlap with product ownership')).toBeInTheDocument()
  })

  it('renders concerns', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Domain ramp-up required')).toBeInTheDocument()
  })

  it('renders red_flags when present', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Unrealistic equity promise')).toBeInTheDocument()
  })

  it('does not render red flags section when red_flags is empty', () => {
    const noFlags: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: { ...fullEvaluation.detailed_reasoning!, red_flags: [] },
    }
    render(<JobDetailScoring evaluation={noFlags} />)
    expect(screen.queryByText(/red flag/i)).not.toBeInTheDocument()
  })

  it('renders the recommendation', () => {
    render(<JobDetailScoring evaluation={fullEvaluation} />)
    expect(screen.getByText('Worth a serious look.')).toBeInTheDocument()
  })

  it('renders fallback message when detailed_reasoning is null', () => {
    const fallback: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: null,
    }
    render(<JobDetailScoring evaluation={fallback} />)
    expect(screen.getByText(/detailed ai scoring is not available yet/i)).toBeInTheDocument()
  })

  it('renders dimension scores even in fallback (dimensions present but no detailed_reasoning)', () => {
    const fallback: Evaluation = {
      ...fullEvaluation,
      detailed_reasoning: null,
    }
    render(<JobDetailScoring evaluation={fallback} />)
    // Dimension numeric scores should still render
    expect(screen.getByText('9.0')).toBeInTheDocument()
  })

  it('renders fallback short reasoning when detailed_reasoning is null', () => {
    const fallback: Evaluation = { ...fullEvaluation, detailed_reasoning: null }
    render(<JobDetailScoring evaluation={fallback} />)
    expect(screen.getByText('Great overall match.')).toBeInTheDocument()
  })
})
