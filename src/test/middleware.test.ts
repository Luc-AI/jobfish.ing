import { describe, it, expect } from 'vitest'

// We test the redirect logic in isolation, not the full middleware
// (Next.js middleware is not easily unit-testable)

describe('middleware route rules', () => {
  const PUBLIC_PATHS = ['/login', '/auth/callback', '/forgot-password', '/reset-password']
  const PROTECTED_PATHS = ['/dashboard', '/preferences', '/notifications', '/onboarding']

  function isPublicPath(pathname: string) {
    return PUBLIC_PATHS.some(p => pathname.startsWith(p))
  }

  it('marks /login as public', () => {
    expect(isPublicPath('/login')).toBe(true)
  })

  it('marks /auth/callback as public', () => {
    expect(isPublicPath('/auth/callback')).toBe(true)
  })

  it('marks /dashboard as protected', () => {
    expect(isPublicPath('/dashboard')).toBe(false)
  })

  it('marks /preferences as protected', () => {
    expect(isPublicPath('/preferences')).toBe(false)
  })

  it('marks /forgot-password as public', () => {
    expect(isPublicPath('/forgot-password')).toBe(true)
  })

  it('marks /reset-password as public', () => {
    expect(isPublicPath('/reset-password')).toBe(true)
  })
})
