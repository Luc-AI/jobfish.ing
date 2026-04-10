import { describe, it, expect } from 'vitest'

// Test the next-param validation logic in isolation (same pattern as middleware.test.ts)
// The route itself is not easily imported in jsdom env, so we test the guard logic directly.

function isSafeNextPath(next: string | null): boolean {
  return !!next && next.startsWith('/') && !next.startsWith('//')
}

describe('callback next-param validation', () => {
  it('accepts /reset-password', () => {
    expect(isSafeNextPath('/reset-password')).toBe(true)
  })

  it('accepts /dashboard', () => {
    expect(isSafeNextPath('/dashboard')).toBe(true)
  })

  it('rejects protocol-relative URL //evil.com', () => {
    expect(isSafeNextPath('//evil.com')).toBe(false)
  })

  it('rejects https:// absolute URL', () => {
    expect(isSafeNextPath('https://evil.com')).toBe(false)
  })

  it('rejects null', () => {
    expect(isSafeNextPath(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeNextPath('')).toBe(false)
  })
})
