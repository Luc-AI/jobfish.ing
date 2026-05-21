import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'

const mockUpdateUser = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
      getUser: mockGetUser,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockSingle.mockResolvedValue({ data: { onboarding_completed: true } })
})

describe('ResetPasswordPage', () => {
  it('renders new password input', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('renders update password button', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('calls updateUser with the entered password', async () => {
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newSecurePass123' })
    })
  })

  it('redirects to /dashboard when onboarding is complete', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('redirects to /onboarding when onboarding is incomplete', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('redirects to /dashboard when profile fetch returns null', async () => {
    mockSingle.mockResolvedValue({ data: null })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error message when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Password too short' } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'abc')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(screen.getByText('Password too short')).toBeInTheDocument()
    })
  })
})
