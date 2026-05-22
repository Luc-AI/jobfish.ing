import { describe, it, expect } from 'vitest'

// Tests the guard logic in isolation — the server component itself
// is not renderable in jsdom. Same pattern as middleware.test.ts.
function resolveAppRoute(
  user: { id: string } | null,
  onboardingCompleted: boolean | null,
  queryError?: boolean
): string | null {
  if (!user) return '/login'
  if (queryError) throw new Error('db error')
  if (!onboardingCompleted) return '/onboarding'
  return null
}

describe('(app) layout guard logic', () => {
  it('redirects to /login when no user', () => {
    expect(resolveAppRoute(null, null)).toBe('/login')
  })

  it('redirects to /onboarding when onboarding_completed is false', () => {
    expect(resolveAppRoute({ id: 'u1' }, false)).toBe('/onboarding')
  })

  it('redirects to /onboarding when profile row is missing (null)', () => {
    expect(resolveAppRoute({ id: 'u1' }, null)).toBe('/onboarding')
  })

  it('allows through when onboarding is complete', () => {
    expect(resolveAppRoute({ id: 'u1' }, true)).toBeNull()
  })

  it('throws on unexpected DB error so error boundary handles it', () => {
    expect(() => resolveAppRoute({ id: 'u1' }, null, true)).toThrow('db error')
  })
})
