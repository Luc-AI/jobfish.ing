import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { AccountForm } from '@/components/features/account-form'

const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { updateUser: mockUpdateUser },
  })),
}))

const defaultProps = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  onSaveName: vi.fn(),
}

function renderWithToaster(ui: React.ReactElement) {
  return render(
    <>
      <Toaster />
      {ui}
    </>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
})

describe('AccountForm – name section', () => {
  it('renders first and last name inputs pre-filled', () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Lovelace')
  })

  it('calls onSaveName with updated values on save', async () => {
    const onSaveName = vi.fn().mockResolvedValue(undefined)
    renderWithToaster(<AccountForm {...defaultProps} onSaveName={onSaveName} />)
    await userEvent.clear(screen.getByLabelText(/first name/i))
    await userEvent.type(screen.getByLabelText(/first name/i), 'Grace')
    await userEvent.click(screen.getByRole('button', { name: /save name/i }))
    await waitFor(() => {
      expect(onSaveName).toHaveBeenCalledWith({ firstName: 'Grace', lastName: 'Lovelace' })
    })
  })

  it('shows error toast when onSaveName throws', async () => {
    const onSaveName = vi.fn().mockRejectedValue(new Error('DB error'))
    renderWithToaster(<AccountForm {...defaultProps} onSaveName={onSaveName} />)
    await userEvent.click(screen.getByRole('button', { name: /save name/i }))
    await waitFor(() => {
      expect(screen.getByText('Failed to update name')).toBeInTheDocument()
    })
  })
})

describe('AccountForm – email section', () => {
  it('renders current email', () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('calls supabase.auth.updateUser with new email', async () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
    })
  })

  it('shows confirmation message after successful email change request', async () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(screen.getByText(/confirmation sent/i)).toBeInTheDocument()
    })
  })

  it('shows success toast after email change request', async () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(screen.getByText('Confirmation email sent. Check your inbox.')).toBeInTheDocument()
    })
  })

  it('shows error toast when updateUser returns an error', async () => {
    mockUpdateUser.mockResolvedValue({ error: new Error('Invalid email') })
    renderWithToaster(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument()
    })
  })

  it('disables Change email button when input is empty', () => {
    renderWithToaster(<AccountForm {...defaultProps} />)
    expect(screen.getByRole('button', { name: /change email/i })).toBeDisabled()
  })
})
