import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after stubbing globals
const { GET } = await import('@/app/api/geoapify/autocomplete/route')

describe('GET /api/geoapify/autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GEOAPIFY_API_KEY = 'test-key'
  })

  it('returns empty suggestions when text param is missing', async () => {
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty suggestions when text is shorter than 2 chars', async () => {
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Z')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns city suggestions formatted as "City, Country"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { city: 'Zug', country: 'Switzerland' } },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland', 'Zug, Switzerland'])
  })

  it('deduplicates identical suggestions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { city: 'Zurich', country: 'Switzerland' } },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland'])
  })

  it('filters out features missing city or country', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          { properties: { city: 'Zurich', country: 'Switzerland' } },
          { properties: { country: 'Germany' } },
          { properties: {} },
        ],
      }),
    })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual(['Zurich, Switzerland'])
  })

  it('returns empty suggestions when Geoapify returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
  })

  it('returns empty suggestions when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const req = new NextRequest('http://localhost/api/geoapify/autocomplete?text=Zur')
    const res = await GET(req)
    const data = await res.json()
    expect(data.suggestions).toEqual([])
  })
})
