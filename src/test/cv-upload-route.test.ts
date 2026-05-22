// src/test/cv-upload-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockUpsert, mockGetText, MockPDFParse } = vi.hoisted(() => {
  const mockGetText = vi.fn()
  const MockPDFParse = vi.fn(function () { return { getText: mockGetText } })
  return {
    mockGetUser: vi.fn(),
    mockUpsert: vi.fn().mockResolvedValue({ error: null }),
    mockGetText,
    MockPDFParse,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({ upsert: mockUpsert })),
  })),
}))

vi.mock('pdf-parse', () => ({
  PDFParse: MockPDFParse,
}))

function makeRequest(file: File | null) {
  const formData = new FormData()
  if (file) formData.append('file', file)
  return {
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as import('next/server').NextRequest
}

function makeFile(name: string, type: string, sizeBytes: number) {
  const content = 'x'.repeat(sizeBytes)
  return new File([content], name, { type })
}

const { POST } = await import('@/app/api/cv/upload/route')

describe('POST /api/cv/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const req = makeRequest(makeFile('cv.pdf', 'application/pdf', 100))
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 422 with code invalid_type for non-PDF file', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    const req = makeRequest(makeFile('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100))
    const res = await POST(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.code).toBe('invalid_type')
    expect(json.error).toBe('Only PDF files are supported')
  })

  it('returns 422 with code too_large for file exceeding 10 MB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    const req = makeRequest(makeFile('cv.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))
    const res = await POST(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.code).toBe('too_large')
    expect(json.error).toBe('File is too large — maximum 10 MB')
  })

  it('returns 422 with code extraction_failed when pdf-parse throws', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    mockGetText.mockRejectedValueOnce(new Error('bad pdf'))
    const req = makeRequest(makeFile('cv.pdf', 'application/pdf', 100))
    const res = await POST(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.code).toBe('extraction_failed')
  })

  it('returns 200 with extractedText on valid PDF', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
    mockGetText.mockResolvedValueOnce({ text: '  Ada Lovelace, Software Engineer  ' })
    const req = makeRequest(makeFile('cv.pdf', 'application/pdf', 100))
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.extractedText).toBe('Ada Lovelace, Software Engineer')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', cv_text: 'Ada Lovelace, Software Engineer' }),
      expect.any(Object),
    )
  })
})
