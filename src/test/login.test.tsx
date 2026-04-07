import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/(auth)/login/page'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('LoginPage', () => {
  it('renders Google sign-in button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('renders email input', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders password input', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows sign up tab', () => {
    render(<LoginPage />)
    expect(screen.getByRole('tab', { name: /sign up/i })).toBeInTheDocument()
  })
})
