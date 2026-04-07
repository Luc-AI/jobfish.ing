import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoreBadge } from '@/components/features/score-badge'

describe('ScoreBadge', () => {
  it('displays the score value', () => {
    render(<ScoreBadge score={8.5} />)
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('applies green style for score >= 8', () => {
    const { container } = render(<ScoreBadge score={8.0} />)
    expect(container.firstChild).toHaveClass('text-green-700')
  })

  it('applies yellow style for score >= 6 and < 8', () => {
    const { container } = render(<ScoreBadge score={6.5} />)
    expect(container.firstChild).toHaveClass('text-yellow-700')
  })

  it('applies red style for score < 6', () => {
    const { container } = render(<ScoreBadge score={4.0} />)
    expect(container.firstChild).toHaveClass('text-red-700')
  })
})
