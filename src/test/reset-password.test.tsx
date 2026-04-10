import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'

const mockUpdateUser = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

beforeEach(() => {
  mockUpdateUser.mockResolvedValue({ error: null })
  mockPush.mockReset()
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

  it('redirects to /dashboard on success', async () => {
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
