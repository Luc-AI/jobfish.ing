import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from '@/components/layout/app-shell'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}))

describe('AppShell', () => {
  it('renders brand name', () => {
    render(<AppShell><div /></AppShell>)
    expect(screen.getByText('jobfishing')).toBeInTheDocument()
  })

  it('renders dashboard navigation link', () => {
    render(<AppShell><div /></AppShell>)
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('renders preferences navigation link', () => {
    render(<AppShell><div /></AppShell>)
    expect(screen.getByRole('link', { name: /preferences/i })).toBeInTheDocument()
  })

  it('renders notifications navigation link', () => {
    render(<AppShell><div /></AppShell>)
    expect(screen.getByRole('link', { name: /notifications/i })).toBeInTheDocument()
  })

  it('applies active styles to current nav link', () => {
    render(<AppShell><div /></AppShell>)
    // usePathname is mocked to return '/dashboard'
    const dashLink = screen.getByRole('link', { name: /dashboard/i })
    expect(dashLink).toHaveClass('bg-primary')
  })

  it('does not apply active styles to non-current nav links', () => {
    render(<AppShell><div /></AppShell>)
    const prefsLink = screen.getByRole('link', { name: /preferences/i })
    expect(prefsLink).toHaveClass('text-muted-foreground')
  })
})
