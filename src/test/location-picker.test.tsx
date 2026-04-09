import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocationPicker } from '@/components/features/location-picker'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('LocationPicker', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a text input', () => {
    render(<LocationPicker value={[]} onChange={onChange} />)
    expect(screen.getByPlaceholderText(/type a city/i)).toBeInTheDocument()
  })

  it('renders chips for pre-selected locations', () => {
    render(<LocationPicker value={['Zurich, Switzerland', 'Berlin, Germany']} onChange={onChange} />)
    expect(screen.getByText('Zurich, Switzerland')).toBeInTheDocument()
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument()
  })

  it('calls onChange without the location when X is clicked', async () => {
    const user = userEvent.setup()
    render(<LocationPicker value={['Zurich, Switzerland', 'Berlin, Germany']} onChange={onChange} />)
    await user.click(screen.getByLabelText('Remove Zurich, Switzerland'))
    expect(onChange).toHaveBeenCalledWith(['Berlin, Germany'])
  })

  it('does not fetch when fewer than 2 chars are typed', async () => {
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Z')
    await new Promise(r => setTimeout(r, 400))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches suggestions after 300ms debounce with 2+ chars', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/geoapify/autocomplete?text=Zu')
    ), { timeout: 600 })
    expect(await screen.findByText('Zurich, Switzerland')).toBeInTheDocument()
  })

  it('calls onChange with the new location when a suggestion is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    const suggestion = await screen.findByText('Zurich, Switzerland', {}, { timeout: 600 })
    await user.click(suggestion)
    expect(onChange).toHaveBeenCalledWith(['Zurich, Switzerland'])
  })

  it('does not add a duplicate location', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: ['Zurich, Switzerland'] }),
    })
    const user = userEvent.setup()
    render(<LocationPicker value={['Zurich, Switzerland']} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText(/type a city/i), 'Zu')
    const suggestion = await screen.findByText('Zurich, Switzerland', {}, { timeout: 600 })
    await user.click(suggestion)
    expect(onChange).not.toHaveBeenCalled()
  })
})
