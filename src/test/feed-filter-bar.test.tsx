import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedFilterBar } from '@/components/features/feed-filter-bar'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('tab=all'),
}))

beforeEach(() => pushMock.mockReset())

describe('FeedFilterBar', () => {
  it('renders all five score chips and both time options', () => {
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.0} />)
    expect(screen.getByRole('button', { name: /hot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /threshold/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8+' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7+' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all scores/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7 days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all time/i })).toBeInTheDocument()
  })

  it('shows the user threshold in the Threshold chip sublabel', () => {
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.5} />)
    expect(screen.getByText(/7\.5\+/)).toBeInTheDocument()
  })

  it('marks the active chip with aria-pressed=true', () => {
    render(<FeedFilterBar activeScore="hot" activeTime="all" userThreshold={7.0} />)
    expect(screen.getByRole('button', { name: /hot/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /threshold/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /all time/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking a score chip navigates to ?tab=all&score=…&time=…', async () => {
    const user = userEvent.setup()
    render(<FeedFilterBar activeScore="threshold" activeTime="7d" userThreshold={7.0} />)
    await user.click(screen.getByRole('button', { name: /^8\+$/ }))
    expect(pushMock).toHaveBeenCalledWith('?tab=all&score=eight&time=7d')
  })

  it('clicking a time button preserves the score filter', async () => {
    const user = userEvent.setup()
    render(<FeedFilterBar activeScore="hot" activeTime="7d" userThreshold={7.0} />)
    await user.click(screen.getByRole('button', { name: /all time/i }))
    expect(pushMock).toHaveBeenCalledWith('?tab=all&score=hot&time=all')
  })
})
