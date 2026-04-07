import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('vitest and jest-dom are configured', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(div).toBeInTheDocument()
  })
})
